import {
  adminBillingSubscriptionListOutput,
  adminBillingTransferProofListOutput,
  adminRecordPaymentInput,
  adminRecordPaymentOutput,
  adminVoidInvoiceInput,
  adminVoidInvoiceOutput,
  billingInvoiceListOutput,
} from "@zaafran/contracts/billing";

// ADM-07 admin billing client. Shapes come from lane A's contract; the routes are requested in
// docs/requests/lane-b-billing.md and mocked with MSW in apps/web/test/mocks until they land.

type Subscriptions = ReturnType<typeof adminBillingSubscriptionListOutput.parse>;
type Invoices = ReturnType<typeof billingInvoiceListOutput.parse>;
type Proofs = ReturnType<typeof adminBillingTransferProofListOutput.parse>;
export type AdminSubscription = Subscriptions["subscriptions"][number];
export type AdminInvoice = Invoices["invoices"][number];
export type AdminTransferProof = Proofs["transferProofs"][number];
export type AdminBillingResult =
  | {
      kind: "ready";
      subscriptions: AdminSubscription[];
      invoices: AdminInvoice[];
      transferProofs: AdminTransferProof[];
    }
  | { kind: "sign-in" }
  | { kind: "error" };
type WriteFailure = { kind: "sign-in" | "stale" | "invalid" | "error" };
export type VoidAttempt = Readonly<{ invoiceId: string; reason: string; key: string }>;

const endpoint = "/v1/admin/billing";
const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

class AuthError extends Error {}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${endpoint}/${path}?limit=50`, {
    ...requestOptions,
    method: "GET",
    ...(signal && { signal }),
  });
  if (response.status === 401 || response.status === 403) throw new AuthError();
  if (!response.ok) throw new Error(`billing ${path} ${String(response.status)}`);
  return response.json();
}

/** One snapshot of the billing console: subscriptions, invoices and transfers to confirm. */
export async function loadAdminBilling(signal?: AbortSignal): Promise<AdminBillingResult> {
  try {
    const [subscriptions, invoices, proofs] = await Promise.all([
      getJson("subscriptions", signal),
      getJson("invoices", signal),
      getJson("transfer-proofs", signal),
    ]);
    return {
      kind: "ready",
      subscriptions: adminBillingSubscriptionListOutput.parse(subscriptions).subscriptions,
      invoices: billingInvoiceListOutput.parse(invoices).invoices,
      transferProofs: adminBillingTransferProofListOutput.parse(proofs).transferProofs,
    };
  } catch (error) {
    return { kind: error instanceof AuthError ? "sign-in" : "error" };
  }
}

async function postJson(path: string, key: string, body: unknown): Promise<Response> {
  return fetch(`${endpoint}/${path}`, {
    ...requestOptions,
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

function writeFailure(response: Response): WriteFailure {
  if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
  if (response.status === 404 || response.status === 409) return { kind: "stale" };
  if (response.status === 400 || response.status === 422) return { kind: "invalid" };
  return { kind: "error" };
}

export function prepareVoidInvoice({
  invoiceId,
  reason,
}: {
  invoiceId: string;
  reason: string;
}): { kind: "ready"; attempt: VoidAttempt } | { kind: "invalid" } {
  const input = adminVoidInvoiceInput.safeParse({ reason });
  if (!input.success) return { kind: "invalid" };
  return {
    kind: "ready",
    attempt: { invoiceId, reason: input.data.reason, key: crypto.randomUUID() },
  };
}

export async function voidInvoice(
  attempt: VoidAttempt,
): Promise<{ kind: "voided" } | WriteFailure> {
  try {
    const path = `invoices/${encodeURIComponent(attempt.invoiceId)}/void`;
    const response = await postJson(path, attempt.key, { reason: attempt.reason });
    if (!response.ok) return writeFailure(response);
    const output = adminVoidInvoiceOutput.safeParse(await response.json());
    return output.success && output.data.invoiceId === attempt.invoiceId
      ? { kind: "voided" }
      : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

/** BIL-05: confirm a merchant's pending transfer for the full invoice total. */
export async function confirmTransferProof({
  proof,
  invoice,
  reason,
  key,
}: {
  proof: AdminTransferProof;
  invoice: AdminInvoice;
  reason: string;
  key: string;
}): Promise<{ kind: "recorded"; amountDzd: number } | WriteFailure> {
  if (proof.invoiceId !== invoice.invoiceId || invoice.status !== "issued")
    return { kind: "error" };
  const input = adminRecordPaymentInput.safeParse({
    source: "transfer_proof",
    transferProofId: proof.transferProofId,
    amountDzd: invoice.totalDzd,
    reason,
  });
  if (!input.success) return { kind: "invalid" };
  try {
    const path = `invoices/${encodeURIComponent(invoice.invoiceId)}/payments`;
    const response = await postJson(path, key, input.data);
    if (!response.ok) return writeFailure(response);
    const output = adminRecordPaymentOutput.safeParse(await response.json());
    const isEcho =
      output.success &&
      output.data.invoiceId === invoice.invoiceId &&
      output.data.amountDzd === invoice.totalDzd;
    if (!isEcho) return { kind: "error" };
    return { kind: "recorded", amountDzd: invoice.totalDzd };
  } catch {
    return { kind: "error" };
  }
}
