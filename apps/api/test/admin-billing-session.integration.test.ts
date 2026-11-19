import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = "2026-11-19T12:00:00.000Z";
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);

test("[BIL-02:security] admin billing lists require an active admin session", async () => {
  const [admin, revokedAdmin, customer, owner] = await Promise.all([
    seedActor("+213500000021", "admin"),
    seedActor("+213500000022", "admin"),
    seedActor("+213500000023", "standard"),
    seedActor("+213500000024", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(owner.userId, "1712");
  const subscriptionId = randomUUID();
  const invoiceId = randomUUID();
  const proofId = randomUUID();
  const proofMediaId = randomUUID();
  const invoiceNumber = "2026-000901";
  const transferReference = "PRIVATE-TRANSFER-901";
  const { sql } = database.get();
  await sql`INSERT INTO public.subscriptions (id, merchant_id, status, price_dzd)
    VALUES (${subscriptionId}, ${merchantId}, 'active', 5000)`;
  await sql`INSERT INTO public.invoices (
      id, merchant_id, subscription_id, number, status, period_starts_at, period_ends_at,
      issued_at, due_at, subtotal_dzd, tax_rate_basis_points, tax_dzd, total_dzd
    ) VALUES (${invoiceId}, ${merchantId}, ${subscriptionId}, ${invoiceNumber}, 'issued',
      ${now}, '2026-12-19T12:00:00.000Z', ${now}, '2026-11-26T12:00:00.000Z', 5000, 0, 0, 5000)`;
  await sql`INSERT INTO public.billing_proof_media (
      id, merchant_id, invoice_id, uploader_id, status, content_type, bytes, created_at, expires_at,
      ready_key, ready_content_type, ready_bytes
    ) VALUES (${proofMediaId}, ${merchantId}, ${invoiceId}, ${owner.userId}, 'ready', 'image/png',
      64, ${now}, '2026-11-20T12:00:00.000Z', 'private-proof-901', 'image/webp', 32)`;
  await sql`INSERT INTO public.billing_transfer_proofs (
      id, merchant_id, invoice_id, proof_media_id, method, reference, status, submitted_at
    ) VALUES (${proofId}, ${merchantId}, ${invoiceId}, ${proofMediaId}, 'ccp',
      ${transferReference}, 'pending_confirmation', ${now})`;
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;

  const api = await openApi();
  const routes = [
    { path: "/v1/admin/billing/subscriptions", marker: subscriptionId },
    { path: "/v1/admin/billing/invoices", marker: invoiceNumber },
    { path: "/v1/admin/billing/transfer-proofs", marker: transferReference },
  ];
  for (const route of routes) {
    const allowed = await api.inject({ method: "GET", url: route.path, headers: admin.headers });
    expect(allowed.statusCode, route.path).toBe(200);
    expect(allowed.headers["cache-control"]).toBe("no-store");
    expect(allowed.body).toContain(route.marker);

    for (const actor of [
      { name: "guest", headers: {}, status: 401 },
      { name: "customer", headers: customer.headers, status: 403 },
      { name: "restaurant", headers: owner.headers, status: 403 },
      { name: "revoked admin", headers: revokedAdmin.headers, status: 401 },
    ]) {
      const denied = await api.inject({ method: "GET", url: route.path, headers: actor.headers });
      expect(denied.statusCode, `${actor.name} ${route.path}`).toBe(actor.status);
      expect(denied.body).not.toContain(invoiceNumber);
      expect(denied.body).not.toContain(transferReference);
      expect(denied.body).not.toContain(merchantId);
    }
  }
});
