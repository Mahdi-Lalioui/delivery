import { randomUUID } from "node:crypto";
import {
  adminRecordPaymentOutput,
  adminVoidInvoiceOutput,
  billingInvoice,
} from "@zaafran/contracts/billing";
import { expect, test } from "vitest";
import { registerMerchantApiFixture } from "./merchant-api-fixture.ts";

const now = new Date().toISOString();
const { database, openApi, seedActor, seedMenuMerchants } = registerMerchantApiFixture(now);
const base = "/v1/admin/billing";

async function billingState() {
  const { sql } = database.get();
  const [invoices, payments, receipts, audit, sequences, media] = await Promise.all([
    sql`SELECT to_jsonb(invoice) AS data FROM public.invoices AS invoice ORDER BY id`,
    sql`SELECT to_jsonb(payment) AS data FROM public.billing_payments AS payment ORDER BY id`,
    sql`SELECT to_jsonb(receipt) AS data FROM public.billing_command_receipts AS receipt
      ORDER BY actor_id, operation, key_hash`,
    sql`SELECT to_jsonb(event) AS data FROM public.audit_log AS event ORDER BY id`,
    sql`SELECT to_jsonb(sequence) AS data FROM public.invoice_sequences AS sequence ORDER BY year`,
    sql`SELECT to_jsonb(media) AS data FROM public.billing_proof_media AS media ORDER BY id`,
  ]);
  return { invoices, payments, receipts, audit, sequences, media };
}

test("[AUTH-05][AUTH-06][ADM-07] invoice issue, payment and void require a live admin session", async () => {
  const [admin, revokedAdmin, owner] = await Promise.all([
    seedActor("+213500000001", "admin"),
    seedActor("+213500000002", "admin"),
    seedActor("+213500000003", "standard"),
  ]);
  const { owned: merchantId } = await seedMenuMerchants(owner.userId);
  const { sql } = database.get();
  await sql`INSERT INTO public.subscriptions (merchant_id, status, price_dzd)
    VALUES (${merchantId}, 'active', 5000)`;
  await sql`UPDATE public.sessions SET revoked_at = ${now} WHERE id = ${revokedAdmin.sessionId}`;
  const api = await openApi();
  const deniedActors = [
    { label: "guest", headers: {}, sessionId: admin.sessionId, expected: 401 },
    { label: "standard", headers: owner.headers, sessionId: owner.sessionId, expected: 403 },
    {
      label: "revoked",
      headers: revokedAdmin.headers,
      sessionId: revokedAdmin.sessionId,
      expected: 401,
    },
  ];
  const issueReason = "Synthetic invoice issue";
  const issue = {
    method: "POST",
    url: `${base}/merchants/${merchantId}/invoices`,
    payload: {
      period: { startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z" },
      reason: issueReason,
    },
  } as const;
  const beforeIssue = await billingState();
  expect(beforeIssue.invoices).toHaveLength(0);
  expect(beforeIssue.payments).toHaveLength(0);
  expect(beforeIssue.receipts).toHaveLength(0);
  expect(beforeIssue.audit).toHaveLength(0);
  for (const actor of deniedActors) {
    const denied = await api.inject({
      ...issue,
      headers: {
        ...actor.headers,
        "x-expected-session-id": actor.sessionId,
        "idempotency-key": `denied-issue-${actor.label}`,
      },
    });
    expect(denied.statusCode, actor.label).toBe(actor.expected);
    expect(denied.json()).toMatchObject({
      code: actor.expected === 401 ? "unauthenticated" : "forbidden",
    });
    expect(await billingState()).toEqual(beforeIssue);
  }
  const adminHeaders = { ...admin.headers, "x-expected-session-id": admin.sessionId };
  const issued = await api.inject({
    ...issue,
    headers: { ...adminHeaders, "idempotency-key": "authorized-issue" },
  });
  expect(issued.statusCode).toBe(201);
  const payableInvoice = billingInvoice.parse(issued.json());
  expect(payableInvoice).toMatchObject({ merchantId, status: "issued", totalDzd: 5000 });
  const issuedForVoid = await api.inject({
    ...issue,
    headers: { ...adminHeaders, "idempotency-key": "authorized-void-invoice" },
    payload: {
      period: { startsAt: "2026-12-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z" },
      reason: issueReason,
    },
  });
  expect(issuedForVoid.statusCode).toBe(201);
  const voidableInvoice = billingInvoice.parse(issuedForVoid.json());
  const proofMediaId = randomUUID();
  await sql`INSERT INTO public.billing_proof_media (
      id, merchant_id, invoice_id, uploader_id, status, content_type, bytes,
      created_at, expires_at, ready_key, ready_content_type, ready_bytes
    ) VALUES (${proofMediaId}, ${merchantId}, ${payableInvoice.invoiceId}, ${owner.userId},
      'ready', 'image/png', 64, ${now}, ${new Date(Date.parse(now) + 86_400_000).toISOString()},
      ${`synthetic-proof/${proofMediaId}`}, 'image/webp', 32)`;
  const paymentReason = "Synthetic confirmed payment";
  const voidReason = "Synthetic invoice void";
  const payment = {
    method: "POST",
    url: `${base}/invoices/${payableInvoice.invoiceId}/payments`,
    payload: {
      source: "manual",
      method: "cash",
      proofMediaId,
      reference: "SYNTHETIC-CASH-1",
      amountDzd: 5000,
      reason: paymentReason,
    },
  } as const;
  const voidInvoice = {
    method: "POST",
    url: `${base}/invoices/${voidableInvoice.invoiceId}/void`,
    payload: { reason: voidReason },
  } as const;
  const beforeSettlement = await billingState();
  expect(beforeSettlement.invoices).toHaveLength(2);
  expect(beforeSettlement.payments).toHaveLength(0);
  expect(beforeSettlement.receipts).toHaveLength(2);
  expect(beforeSettlement.audit).toHaveLength(2);
  for (const [operation, request] of [
    ["payment", payment],
    ["void", voidInvoice],
  ] as const) {
    for (const actor of deniedActors) {
      const denied = await api.inject({
        ...request,
        headers: {
          ...actor.headers,
          "x-expected-session-id": actor.sessionId,
          "idempotency-key": `denied-${operation}-${actor.label}`,
        },
      });
      expect(denied.statusCode, `${actor.label} ${operation}`).toBe(actor.expected);
      expect(denied.json()).toMatchObject({
        code: actor.expected === 401 ? "unauthenticated" : "forbidden",
      });
      expect(denied.body).not.toContain(payableInvoice.invoiceId);
      expect(denied.body).not.toContain(voidableInvoice.invoiceId);
      expect(await billingState()).toEqual(beforeSettlement);
    }
  }
  const paid = await api.inject({
    ...payment,
    headers: { ...adminHeaders, "idempotency-key": "authorized-payment" },
  });
  expect(paid.statusCode).toBe(200);
  const recorded = adminRecordPaymentOutput.parse(paid.json());
  expect(recorded).toMatchObject({
    invoiceId: payableInvoice.invoiceId,
    proofMediaId,
    amountDzd: 5000,
    method: "cash",
    reference: "SYNTHETIC-CASH-1",
  });
  expect(
    await sql`SELECT confirmed_by, invoice_id FROM public.billing_payments WHERE id = ${recorded.paymentId}`,
  ).toEqual([{ confirmed_by: admin.userId, invoice_id: payableInvoice.invoiceId }]);
  expect(
    await sql`SELECT status FROM public.invoices WHERE id = ${payableInvoice.invoiceId}`,
  ).toEqual([{ status: "paid" }]);
  const voided = await api.inject({
    ...voidInvoice,
    headers: { ...adminHeaders, "idempotency-key": "authorized-void" },
  });
  expect(voided.statusCode).toBe(200);
  expect(adminVoidInvoiceOutput.parse(voided.json())).toEqual({
    invoiceId: voidableInvoice.invoiceId,
    status: "void",
    voidedAt: now,
  });
  expect(
    await sql`SELECT status, void_reason FROM public.invoices WHERE id = ${voidableInvoice.invoiceId}`,
  ).toEqual([{ status: "void", void_reason: voidReason }]);
  expect(
    await sql`SELECT actor_id, operation, target_id, reason FROM public.billing_command_receipts ORDER BY operation, target_id`,
  ).toEqual([
    {
      actor_id: admin.userId,
      operation: "invoice_issue",
      target_id: merchantId,
      reason: issueReason,
    },
    {
      actor_id: admin.userId,
      operation: "invoice_issue",
      target_id: merchantId,
      reason: issueReason,
    },
    {
      actor_id: admin.userId,
      operation: "invoice_void",
      target_id: voidableInvoice.invoiceId,
      reason: voidReason,
    },
    {
      actor_id: admin.userId,
      operation: "payment_record",
      target_id: payableInvoice.invoiceId,
      reason: paymentReason,
    },
  ]);
  expect(
    await sql`SELECT actor_id, merchant_id, action, reason FROM public.audit_log ORDER BY action, reason`,
  ).toEqual([
    {
      actor_id: admin.userId,
      merchant_id: merchantId,
      action: "invoice_issued",
      reason: issueReason,
    },
    {
      actor_id: admin.userId,
      merchant_id: merchantId,
      action: "invoice_issued",
      reason: issueReason,
    },
    {
      actor_id: admin.userId,
      merchant_id: merchantId,
      action: "invoice_payment_recorded",
      reason: paymentReason,
    },
    {
      actor_id: admin.userId,
      merchant_id: merchantId,
      action: "invoice_voided",
      reason: voidReason,
    },
  ]);
});
