import { billingSettingsDefaults } from "@zaafran/contracts/billing";
import type { createBillingWriteRepository } from "@zaafran/db/billing";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createBillingWriteRepository>;
const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const invoiceId = "01932f18-3150-7c33-8a7a-53acfd343003";
const now = new Date("2026-11-08T12:00:00Z");
const admin = { role: "admin", accountId: id, sessionId } as const;
const headers = { "idempotency-key": "fixture-billing-write", "x-expected-session-id": sessionId };
const base = "/v1/admin/billing";
const reason = "Décision fictive de test";
const period = { startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" };
const voidRequest = {
  method: "POST",
  url: `${base}/invoices/${invoiceId}/void`,
  headers,
  payload: { reason },
} as const;

function setup(actor: Actor) {
  const repository = {
    issue: vi.fn<Repository["issue"]>(),
    voidInvoice: vi.fn<Repository["voidInvoice"]>(),
    recordPayment: vi.fn<Repository["recordPayment"]>(),
    updateSettings: vi.fn<Repository["updateSettings"]>(),
  } satisfies Repository;
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    billingWrites: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[ADM-07:http] issues and voids invoices with session-bound keys", async () => {
  const { api, repository } = setup(admin);
  const invoice = {
    invoiceId,
    merchantId: id,
    number: "2026-000001",
    status: "issued" as const,
    period,
    issuedAt: now.toISOString(),
    dueAt: "2026-11-15T12:00:00Z",
    subtotalDzd: 5_000,
    taxRateBasisPoints: 0,
    taxDzd: 0,
    totalDzd: 5_000,
    pdfAvailable: false,
  };
  repository.issue.mockResolvedValue({ kind: "replayed", value: invoice });
  const voided = { invoiceId, status: "void" as const, voidedAt: now.toISOString() };
  repository.voidInvoice.mockResolvedValue({ kind: "applied", value: voided });
  const issued = await api.inject({
    method: "POST",
    url: `${base}/merchants/${id}/invoices`,
    headers,
    payload: { period, reason },
  });
  expect(issued.statusCode).toBe(201);
  expect(issued.json()).toEqual(invoice);
  expect(repository.issue).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      adminUserId: id,
      merchantId: id,
      input: { period, reason },
      now,
    }),
  );
  const response = await api.inject(voidRequest);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(voided);
});

test("[ADM-07:http] records an exact payment and returns session-bound settings", async () => {
  const { api, repository } = setup(admin);
  const payment = {
    paymentId: id,
    invoiceId,
    method: "cash" as const,
    reference: "REÇU-TEST",
    proofMediaId: id,
    amountDzd: 5_000,
    confirmedAt: now.toISOString(),
  };
  repository.recordPayment.mockResolvedValue({ kind: "applied", value: payment });
  const recorded = await api.inject({
    method: "POST",
    url: `${base}/invoices/${invoiceId}/payments`,
    headers,
    payload: {
      source: "manual",
      method: "cash",
      reference: "REÇU-TEST",
      proofMediaId: id,
      amountDzd: 5_000,
      reason,
    },
  });
  expect(recorded.statusCode).toBe(200);
  expect(recorded.json()).toEqual(payment);
  const value = { settings: billingSettingsDefaults };
  repository.updateSettings.mockResolvedValue({ kind: "replayed", value });
  const saved = await api.inject({
    method: "PUT",
    url: `${base}/settings`,
    headers,
    payload: { ...value, reason },
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.json()).toEqual({ ...value, sessionId });
});

test("[ADM-07:http] denies stale sessions and reports invoice conflicts", async () => {
  const { api, repository } = setup(admin);
  const stale = await api.inject({
    ...voidRequest,
    headers: { ...headers, "x-expected-session-id": id },
  });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ code: "session_changed" });
  expect(repository.voidInvoice).not.toHaveBeenCalled();
  repository.voidInvoice.mockResolvedValue({ kind: "invalid_status" });
  const conflict = await api.inject(voidRequest);
  expect(conflict.statusCode).toBe(409);
  expect(conflict.json()).toMatchObject({ code: "invalid_status" });
});
