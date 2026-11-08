import {
  adminBillingSubscriptionListOutput,
  adminBillingTransferProofListOutput,
  adminRecordPaymentInput,
  adminRecordPaymentOutput,
  adminVoidInvoiceInput,
  adminVoidInvoiceOutput,
  billingInvoiceListOutput,
} from "@zaafran/contracts/billing";
import { http, HttpResponse } from "msw";

// MSW handlers for the admin billing routes requested in docs/requests/lane-b-billing.md.
// Every payload is parsed with lane A's published contract, so the mocks cannot drift from it.

type Invoice = ReturnType<typeof billingInvoiceListOutput.parse>["invoices"][number];
type TransferProof = ReturnType<
  typeof adminBillingTransferProofListOutput.parse
>["transferProofs"][number];

export const billingMockIds = {
  sessionId: "019d6abc-0000-7000-8000-000000000001",
  merchantId: "019d6abc-0000-7000-8000-000000000002",
  subscriptionId: "019d6abc-0000-7000-8000-000000000003",
  issuedInvoiceId: "019d6abc-0000-7000-8000-000000000004",
  paidInvoiceId: "019d6abc-0000-7000-8000-000000000005",
  transferProofId: "019d6abc-0000-7000-8000-000000000006",
  proofMediaId: "019d6abc-0000-7000-8000-000000000007",
  paymentId: "019d6abc-0000-7000-8000-000000000008",
} as const;

const ids = billingMockIds;
const now = "2027-02-08T09:00:00.000Z";

function invoice(invoiceId: string, number: string, status: Invoice["status"]): Invoice {
  return {
    invoiceId,
    merchantId: ids.merchantId,
    number,
    status,
    period: { startsAt: "2027-01-31T23:00:00.000Z", endsAt: "2027-02-28T23:00:00.000Z" },
    issuedAt: "2027-01-31T23:00:00.000Z",
    dueAt: "2027-02-07T23:00:00.000Z",
    subtotalDzd: 5000,
    taxRateBasisPoints: 0,
    taxDzd: 0,
    totalDzd: 5000,
    pdfAvailable: true,
  };
}

export function billingMockData() {
  const invoices: Invoice[] = [
    invoice(ids.issuedInvoiceId, "2027-000002", "issued"),
    invoice(ids.paidInvoiceId, "2027-000001", "paid"),
  ];
  const transferProofs: TransferProof[] = [
    {
      transferProofId: ids.transferProofId,
      invoiceId: ids.issuedInvoiceId,
      method: "baridimob",
      reference: "BM-2027-0042",
      proofMediaId: ids.proofMediaId,
      status: "pending_confirmation",
      submittedAt: now,
    },
  ];
  return { invoices, transferProofs };
}

const subscriptionPage = adminBillingSubscriptionListOutput.parse({
  sessionId: ids.sessionId,
  nextCursor: null,
  subscriptions: [
    {
      subscriptionId: ids.subscriptionId,
      merchantId: ids.merchantId,
      status: "past_due",
      priceDzd: 5000,
      trialEndsAt: "2027-01-31T23:00:00.000Z",
      period: { startsAt: "2027-01-31T23:00:00.000Z", endsAt: "2027-02-28T23:00:00.000Z" },
      nextInvoiceAt: "2027-02-28T23:00:00.000Z",
    },
  ],
});

const base = "*/v1/admin/billing";

function sessionProblem() {
  return HttpResponse.json(
    {
      type: "https://zaafran.invalid/problems/session_changed",
      title: "Session changed",
      status: 409,
      code: "session_changed",
      requestId: "mock",
    },
    { status: 409 },
  );
}

/** Lane A binds billing writes to the admin session read with the lists. */
function isCurrentSession(request: Request): boolean {
  return request.headers.get("x-expected-session-id") === ids.sessionId;
}

/** Stateful handlers: voiding or paying an invoice is visible on the next list request. */
export function adminBillingHandlers(data = billingMockData()) {
  return [
    http.get(`${base}/subscriptions`, () => HttpResponse.json(subscriptionPage)),
    http.get(`${base}/invoices`, () =>
      HttpResponse.json(
        billingInvoiceListOutput.parse({
          sessionId: ids.sessionId,
          nextCursor: null,
          invoices: data.invoices,
        }),
      ),
    ),
    http.get(`${base}/transfer-proofs`, () =>
      HttpResponse.json(
        adminBillingTransferProofListOutput.parse({
          sessionId: ids.sessionId,
          nextCursor: null,
          transferProofs: data.transferProofs,
        }),
      ),
    ),
    http.post(`${base}/invoices/:invoiceId/void`, async ({ request, params }) => {
      if (!isCurrentSession(request)) return sessionProblem();
      const target = data.invoices.find((row) => row.invoiceId === params.invoiceId);
      const input = adminVoidInvoiceInput.safeParse(await request.json());
      if (!input.success) return HttpResponse.json({ code: "invalid_request" }, { status: 400 });
      if (target?.status !== "issued")
        return HttpResponse.json({ code: "invalid_status" }, { status: 409 });
      target.status = "void";
      return HttpResponse.json(
        adminVoidInvoiceOutput.parse({
          invoiceId: target.invoiceId,
          status: "void",
          voidedAt: now,
        }),
      );
    }),
    http.post(`${base}/invoices/:invoiceId/payments`, async ({ request, params }) => {
      if (!isCurrentSession(request)) return sessionProblem();
      const target = data.invoices.find((row) => row.invoiceId === params.invoiceId);
      const input = adminRecordPaymentInput.safeParse(await request.json());
      if (!input.success) return HttpResponse.json({ code: "invalid_request" }, { status: 400 });
      if (input.data.source !== "transfer_proof") return HttpResponse.json({}, { status: 501 });
      const proofId = input.data.transferProofId;
      const proof = data.transferProofs.find((row) => row.transferProofId === proofId);
      if (target?.status !== "issued" || proof === undefined) {
        return HttpResponse.json({ code: "invalid_status" }, { status: 409 });
      }
      target.status = "paid";
      data.transferProofs = data.transferProofs.filter((row) => row !== proof);
      return HttpResponse.json(
        adminRecordPaymentOutput.parse({
          paymentId: ids.paymentId,
          invoiceId: target.invoiceId,
          method: proof.method,
          reference: proof.reference,
          proofMediaId: proof.proofMediaId,
          amountDzd: input.data.amountDzd,
          confirmedAt: now,
        }),
      );
    }),
  ];
}
