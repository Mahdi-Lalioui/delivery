import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import {
  billingBanner,
  invoicePdfUrl,
  loadMerchantBilling,
  submitTransferProof,
} from "../src/admin/billing/merchant-billing-http";
import { billingMockIds as ids } from "./mocks/admin-billing-handlers";
import {
  merchantBillingHandlers,
  merchantBillingMockState,
} from "./mocks/merchant-billing-handlers";

const server = setupServer();
let state = merchantBillingMockState();

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});
beforeEach(() => {
  state = merchantBillingMockState();
  server.resetHandlers(...merchantBillingHandlers(state));
  const interceptedFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
    interceptedFetch(new URL(input, "http://merchant.test"), init),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  server.close();
});

const noWait = () => Promise.resolve();
const keys = { reserveKey: crypto.randomUUID(), submitKey: crypto.randomUUID() };

test("[MER-22] loads the plan status and invoices of the merchant", async () => {
  const result = await loadMerchantBilling(ids.merchantId);
  expect(result.kind).toBe("ready");
  if (result.kind !== "ready") return;
  expect(result.subscription?.status).toBe("past_due");
  expect(result.invoices.map((row) => row.status)).toEqual(["issued", "paid"]);
  expect(result.isOnlinePaymentEnabled).toBe(false);
});

test("[MER-22] maps another merchant to not-found and auth failures to sign-in", async () => {
  expect(await loadMerchantBilling(ids.subscriptionId)).toEqual({ kind: "not-found" });
  server.use(
    http.get("*/v1/merchants/:merchantId/billing", () => new HttpResponse(null, { status: 401 })),
  );
  expect(await loadMerchantBilling(ids.merchantId)).toEqual({ kind: "sign-in" });
});

test("[MER-22] picks the banner for due, past due and suspended plans", () => {
  const { subscription, invoices } = merchantBillingMockState("active");
  expect(billingBanner(subscription, invoices)).toBe("due");
  expect(billingBanner({ ...subscription, status: "past_due" }, invoices)).toBe("past_due");
  expect(billingBanner({ ...subscription, status: "suspended" }, invoices)).toBe("suspended");
  expect(billingBanner({ ...subscription, status: "trialing" }, invoices)).toBe("trial");
  const paidOnly = invoices.filter((row) => row.status !== "issued");
  expect(billingBanner(subscription, paidOnly)).toBeUndefined();
  expect(billingBanner(null, invoices)).toBeUndefined();
});

test("[MER-22] builds an encoded PDF link for an invoice", () => {
  expect(invoicePdfUrl(ids.merchantId, ids.issuedInvoiceId)).toBe(
    `/v1/merchants/${ids.merchantId}/invoices/${ids.issuedInvoiceId}/pdf`,
  );
});

test("[MER-22][BIL-05] uploads the proof photo, waits until ready, then submits the transfer", async () => {
  const file = new File([new Uint8Array(1200)], "recu.jpg", { type: "image/jpeg" });
  const result = await submitTransferProof({
    merchantId: ids.merchantId,
    invoiceId: ids.issuedInvoiceId,
    method: "ccp",
    reference: " CCP-778899 ",
    file,
    keys,
    wait: noWait,
  });
  expect(result).toEqual({ kind: "submitted" });
  expect(state.uploadedBytes).toBe(1200);
  expect(state.submitted).toEqual([
    expect.objectContaining({
      method: "ccp",
      reference: "CCP-778899",
      proofMediaId: ids.proofMediaId,
      status: "pending_confirmation",
    }),
  ]);
});

test("[MER-22] rejects a bad reference or file before uploading anything", async () => {
  const pdf = new File([new Uint8Array(10)], "recu.pdf", { type: "application/pdf" });
  const photo = new File([new Uint8Array(10)], "recu.png", { type: "image/png" });
  const input = { merchantId: ids.merchantId, invoiceId: ids.issuedInvoiceId, keys, wait: noWait };
  expect(
    await submitTransferProof({ ...input, method: "ccp", reference: "ok", file: pdf }),
  ).toEqual({
    kind: "invalid",
    field: "file",
  });
  expect(
    await submitTransferProof({ ...input, method: "ccp", reference: " ", file: photo }),
  ).toEqual({
    kind: "invalid",
    field: "reference",
  });
  expect(state.uploadedBytes).toBe(0);
});

test("[MER-22] stops when the proof photo is rejected or never becomes ready", async () => {
  const file = new File([new Uint8Array(10)], "recu.jpg", { type: "image/jpeg" });
  const input = {
    merchantId: ids.merchantId,
    invoiceId: ids.issuedInvoiceId,
    method: "baridimob" as const,
    reference: "BM-1",
    file,
    keys,
    wait: noWait,
  };
  state.preparingReads = 100;
  expect(await submitTransferProof(input)).toEqual({ kind: "upload-expired" });
  server.use(
    http.get(
      "*/v1/merchants/:merchantId/invoices/:invoiceId/proof-media/:proofMediaId",
      ({ params }) =>
        HttpResponse.json({
          invoiceId: params.invoiceId,
          proofMediaId: params.proofMediaId,
          status: "rejected",
          reason: "invalid_image",
        }),
    ),
  );
  expect(await submitTransferProof(input)).toEqual({ kind: "rejected-photo" });
  expect(state.submitted).toEqual([]);
});

test("[MER-22][BIL-05] sends the caller's idempotency keys so a retry is deduplicated", async () => {
  const seen: string[] = [];
  server.events.on("request:start", ({ request }) => {
    const key = request.headers.get("idempotency-key");
    if (key !== null) seen.push(key);
  });
  const file = new File([new Uint8Array(10)], "recu.jpg", { type: "image/jpeg" });
  const input = {
    merchantId: ids.merchantId,
    invoiceId: ids.issuedInvoiceId,
    method: "ccp" as const,
    reference: "CCP-1",
    file,
    keys,
    wait: noWait,
  };
  await submitTransferProof(input);
  state.preparingReads = 1;
  await submitTransferProof(input);
  server.events.removeAllListeners();
  expect(seen).toEqual([keys.reserveKey, keys.submitKey, keys.reserveKey, keys.submitKey]);
});

test("[MER-22] stops polling once the upload reservation expires", async () => {
  server.use(
    http.post("*/v1/merchants/:merchantId/invoices/:invoiceId/proof-media", ({ params }) =>
      HttpResponse.json(
        {
          invoiceId: params.invoiceId,
          proofMediaId: ids.proofMediaId,
          status: "awaiting_upload",
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
        { status: 201 },
      ),
    ),
  );
  const file = new File([new Uint8Array(10)], "recu.jpg", { type: "image/jpeg" });
  const input = {
    merchantId: ids.merchantId,
    invoiceId: ids.issuedInvoiceId,
    method: "ccp" as const,
    reference: "CCP-1",
    file,
    keys,
    wait: noWait,
  };
  expect(await submitTransferProof(input)).toEqual({ kind: "upload-expired" });
  expect(state.submitted).toEqual([]);
});

test("[MER-22] rejects invoices that belong to another merchant", async () => {
  const [first] = state.invoices;
  if (first === undefined) throw new Error("fixture missing");
  first.merchantId = ids.subscriptionId;
  expect(await loadMerchantBilling(ids.merchantId)).toEqual({ kind: "error" });
});
