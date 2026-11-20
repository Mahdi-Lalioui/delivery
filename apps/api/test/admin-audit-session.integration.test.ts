import { adminAuditOutput } from "@zaafran/contracts/admin-ops";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor } = registerMerchantApiFixture(now);

test("[AUTH-05][AUTH-06][ADM-08] only a live admin session can read the audit log", async () => {
  const [admin, revokedAdmin, customer] = await Promise.all([
    seedActor("+213500000001", "admin"),
    seedActor("+213500000002", "admin"),
    seedActor("+213500000003", "standard"),
  ]);
  const marker = "synthetic-audit-session-marker";
  const api = await openApi();
  const changed = await api.inject({
    method: "PUT",
    url: "/v1/admin/settings/order_accept_timeout_seconds",
    headers: {
      ...admin.headers,
      "x-expected-session-id": admin.sessionId,
      "idempotency-key": "audit-session-marker",
    },
    payload: { value: 600, reason: marker },
  });
  expect(changed.statusCode).toBe(200);
  const { sql } = database.get();
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const allowed = await api.inject({ url: "/v1/admin/audit?limit=10", headers: admin.headers });
  expect(allowed.statusCode).toBe(200);
  expect(allowed.headers["cache-control"]).toBe("no-store");
  expect(adminAuditOutput.parse(allowed.json()).events).toContainEqual(
    expect.objectContaining({ actorId: admin.userId, reason: marker }),
  );

  for (const actor of [
    { label: "guest", headers: {}, expected: 401 },
    { label: "customer", headers: customer.headers, expected: 403 },
    { label: "revoked admin", headers: revokedAdmin.headers, expected: 401 },
  ]) {
    const denied = await api.inject({ url: "/v1/admin/audit?limit=10", headers: actor.headers });
    expect(denied.statusCode, actor.label).toBe(actor.expected);
    expect(denied.json()).toMatchObject({
      code: actor.expected === 401 ? "unauthenticated" : "forbidden",
    });
    expect(denied.body).not.toContain(marker);
    expect(denied.body).not.toContain(admin.userId);
  }
});
