import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  confirmTransferProof,
  loadAdminBilling,
  prepareVoidInvoice,
  voidInvoice,
} from "../src/admin/billing/admin-billing-http";
import { adminBillingHandlers, billingMockIds as ids } from "./mocks/admin-billing-handlers";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  server.resetHandlers(...adminBillingHandlers());
  const interceptedFetch = globalThis.fetch;
  // The client uses same-origin relative URLs; give them an origin in Node.
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://admin.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

test("[ADM-07:web] loads subscriptions, invoices and pending transfer proofs", async () => {
  const result = await loadAdminBilling();
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") return;
  expect(result.subscriptions.map((row) => row.status)).toEqual(["past_due"]);
  expect(result.invoices.map((row) => [row.number, row.status])).toEqual([
    ["2027-000002", "issued"],
    ["2027-000001", "paid"],
  ]);
  expect(result.transferProofs).toEqual([
    expect.objectContaining({ status: "pending_confirmation", method: "baridimob" }),
  ]);
});

test("[ADM-07:web] confirming a pending transfer records the invoice total and marks it paid", async () => {
  const before = await loadAdminBilling();
  if (before.kind !== "ready") throw new Error("expected ready");
  const [proof] = before.transferProofs;
  const [issued] = before.invoices;
  if (proof === undefined || issued === undefined) throw new Error("fixture missing");

  const result = await confirmTransferProof({
    proof,
    invoice: issued,
    reason: "Virement vérifié",
    key: crypto.randomUUID(),
  });
  expect(result).toEqual({ kind: "recorded", amountDzd: 5000 });

  const after = await loadAdminBilling();
  if (after.kind !== "ready") throw new Error("expected ready");
  expect(after.invoices[0]?.status).toBe("paid");
  expect(after.transferProofs).toEqual([]);
});

test("[ADM-07:web] voids an issued invoice only with a reason", async () => {
  expect(prepareVoidInvoice({ invoiceId: ids.issuedInvoiceId, reason: "  " })).toEqual({
    kind: "invalid",
  });
  const prepared = prepareVoidInvoice({ invoiceId: ids.issuedInvoiceId, reason: "Doublon" });
  if (prepared.kind !== "ready") throw new Error("expected ready");
  expect(await voidInvoice(prepared.attempt)).toEqual({ kind: "voided" });
  expect(await voidInvoice(prepared.attempt)).toEqual({ kind: "stale" });
});

test("[ADM-07:web] maps auth failures and malformed payloads", async () => {
  server.use(
    http.get("*/v1/admin/billing/invoices", () => new HttpResponse(null, { status: 403 })),
  );
  expect(await loadAdminBilling()).toEqual({ kind: "sign-in" });
  server.use(http.get("*/v1/admin/billing/invoices", () => HttpResponse.json({ invoices: "x" })));
  expect(await loadAdminBilling()).toEqual({ kind: "error" });
});

test("[ADM-07:web] refuses to confirm a proof against a different invoice", async () => {
  const before = await loadAdminBilling();
  if (before.kind !== "ready") throw new Error("expected ready");
  const [proof] = before.transferProofs;
  const paid = before.invoices[1];
  if (proof === undefined || paid === undefined) throw new Error("fixture missing");
  expect(
    await confirmTransferProof({
      proof,
      invoice: paid,
      reason: "Virement vérifié",
      key: crypto.randomUUID(),
    }),
  ).toEqual({
    kind: "error",
  });
});

test("[ADM-07:web][BIL-05] reports an error when the server records a different amount", async () => {
  const before = await loadAdminBilling();
  if (before.kind !== "ready") throw new Error("expected ready");
  const [proof] = before.transferProofs;
  const [issued] = before.invoices;
  if (proof === undefined || issued === undefined) throw new Error("fixture missing");
  server.use(
    http.post("*/v1/admin/billing/invoices/:invoiceId/payments", ({ params }) =>
      HttpResponse.json({
        paymentId: ids.paymentId,
        invoiceId: params.invoiceId,
        method: "baridimob",
        reference: "BM-2027-0042",
        proofMediaId: ids.proofMediaId,
        amountDzd: 4000,
        confirmedAt: "2027-02-08T09:00:00.000Z",
      }),
    ),
  );
  const key = crypto.randomUUID();
  expect(
    await confirmTransferProof({ proof, invoice: issued, reason: "Virement vérifié", key }),
  ).toEqual({ kind: "error" });
});
