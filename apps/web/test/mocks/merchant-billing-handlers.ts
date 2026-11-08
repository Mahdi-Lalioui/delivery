import {
  billingInvoiceListOutput,
  billingProofMediaOutput,
  billingProofUploadInput,
  billingProofUploadOutput,
  merchantBillingSubscriptionOutput,
  merchantTransferProofInput,
  merchantTransferProofOutput,
} from "@zaafran/contracts/billing";
import { http, HttpResponse } from "msw";
import { billingMockData, billingMockIds as ids } from "./admin-billing-handlers";

// MER-22 handlers for the merchant billing routes in docs/requests/lane-b-billing.md.
type Subscription = NonNullable<
  ReturnType<typeof merchantBillingSubscriptionOutput.parse>["subscription"]
>;

const now = "2027-02-08T09:00:00.000Z";
const base = `*/v1/merchants/:merchantId`;

export function merchantBillingMockState(status: Subscription["status"] = "past_due") {
  const subscription: Subscription = {
    subscriptionId: ids.subscriptionId,
    merchantId: ids.merchantId,
    status,
    priceDzd: 5000,
    trialEndsAt: "2027-01-31T23:00:00.000Z",
    period: { startsAt: "2027-01-31T23:00:00.000Z", endsAt: "2027-02-28T23:00:00.000Z" },
    nextInvoiceAt: "2027-02-28T23:00:00.000Z",
  };
  const submitted: ReturnType<typeof merchantTransferProofOutput.parse>[] = [];
  return {
    subscription,
    invoices: billingMockData().invoices,
    uploadedBytes: 0,
    // Number of status reads that still report "preparing" before the proof is ready.
    preparingReads: 1,
    submitted,
  };
}

type State = ReturnType<typeof merchantBillingMockState>;

function isOwnMerchant(merchantId: unknown) {
  return merchantId === ids.merchantId;
}

function readHandlers(state: State) {
  return [
    http.get(`${base}/billing`, ({ params }) => {
      if (!isOwnMerchant(params.merchantId)) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json(
        merchantBillingSubscriptionOutput.parse({
          sessionId: ids.sessionId,
          merchantId: ids.merchantId,
          subscription: state.subscription,
          subscriptionOnlinePaymentEnabled: false,
        }),
      );
    }),
    http.get(`${base}/invoices`, ({ params }) => {
      if (!isOwnMerchant(params.merchantId)) return new HttpResponse(null, { status: 404 });
      return HttpResponse.json(
        billingInvoiceListOutput.parse({
          sessionId: ids.sessionId,
          nextCursor: null,
          invoices: state.invoices,
        }),
      );
    }),
  ];
}

function proofHandlers(state: State) {
  const proofPath = `${base}/invoices/:invoiceId/proof-media`;
  return [
    http.post(proofPath, async ({ request, params }) => {
      const input = billingProofUploadInput.safeParse(await request.json());
      if (!input.success) return HttpResponse.json({ code: "invalid_request" }, { status: 400 });
      return HttpResponse.json(
        billingProofUploadOutput.parse({
          invoiceId: params.invoiceId,
          proofMediaId: ids.proofMediaId,
          status: "awaiting_upload",
          expiresAt: "2027-02-08T09:15:00.000Z",
        }),
        { status: 201 },
      );
    }),
    http.put(`${proofPath}/:proofMediaId/content`, async ({ request, params }) => {
      state.uploadedBytes = (await request.arrayBuffer()).byteLength;
      return HttpResponse.json(
        billingProofMediaOutput.parse({
          invoiceId: params.invoiceId,
          proofMediaId: params.proofMediaId,
          status: "preparing",
        }),
        { status: 202 },
      );
    }),
    http.get(`${proofPath}/:proofMediaId`, ({ params }) => {
      const isPreparing = state.preparingReads > 0;
      state.preparingReads -= 1;
      const ready = { status: "ready", contentType: "image/jpeg", bytes: state.uploadedBytes };
      return HttpResponse.json(
        billingProofMediaOutput.parse({
          invoiceId: params.invoiceId,
          proofMediaId: params.proofMediaId,
          ...(isPreparing ? { status: "preparing" } : ready),
        }),
      );
    }),
  ];
}

function submitHandler(state: State) {
  return http.post(`${base}/invoices/:invoiceId/transfer-proofs`, async ({ request, params }) => {
    const input = merchantTransferProofInput.safeParse(await request.json());
    if (!input.success) return HttpResponse.json({ code: "invalid_request" }, { status: 400 });
    const output = merchantTransferProofOutput.parse({
      ...input.data,
      transferProofId: ids.transferProofId,
      invoiceId: params.invoiceId,
      status: "pending_confirmation",
      submittedAt: now,
    });
    state.submitted.push(output);
    return HttpResponse.json(output, { status: 201 });
  });
}

export function merchantBillingHandlers(state = merchantBillingMockState()) {
  return [...readHandlers(state), ...proofHandlers(state), submitHandler(state)];
}
