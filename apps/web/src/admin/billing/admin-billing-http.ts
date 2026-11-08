import {
  adminBillingSubscriptionListOutput,
  adminBillingTransferProofListOutput,
  adminRecordPaymentInput,
  adminRecordPaymentOutput,
  adminVoidInvoiceInput,
  adminVoidInvoiceOutput,
  billingInvoiceListOutput,
} from "@zaafran/contracts/billing";
import { problemResponseSchema } from "@zaafran/contracts/health";

// ADM-07 admin billing client on lane A's routes (docs/requests/lane-a-backend-batch.md). Writes are
// bound to the admin session read with the lists (X-Expected-Session-Id).

type Subscriptions = ReturnType<typeof adminBillingSubscriptionListOutput.parse>;
type Invoices = ReturnType<typeof billingInvoiceListOutput.parse>;
type Proofs = ReturnType<typeof adminBillingTransferProofListOutput.parse>;
export type AdminSubscription = Subscriptions["subscriptions"][number];
export type AdminInvoice = Invoices["invoices"][number];
export type AdminTransferProof = Proofs["transferProofs"][number];
export type AdminBillingResult =
  | {
      kind: "ready";
      sessionId: string;
      subscriptions: AdminSubscription[];
      invoices: AdminInvoice[];
      transferProofs: AdminTransferProof[];
    }
  | { kind: "sign-in" }
  | { kind: "error" };
type WriteFailure = { kind: "sign-in" | "session-changed" | "stale" | "invalid" | "error" };
export type VoidAttempt = Readonly<{
  invoiceId: string;
  reason: string;
  key: string;
  expectedSessionId: string;
}>;

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
    const subscriptionPage = adminBillingSubscriptionListOutput.parse(subscriptions);
    const invoicePage = billingInvoiceListOutput.parse(invoices);
    const proofPage = adminBillingTransferProofListOutput.parse(proofs);
    const { sessionId } = subscriptionPage;
    // All three lists must come from the same admin session, or a write could target a stale tab.
    if (invoicePage.sessionId !== sessionId || proofPage.sessionId !== sessionId)
      return { kind: "error" };
    return {
      kind: "ready",
      sessionId,
      subscriptions: subscriptionPage.subscriptions,
      invoices: invoicePage.invoices,
      transferProofs: proofPage.transferProofs,
    };
  } catch (error) {
    return { kind: error instanceof AuthError ? "sign-in" : "error" };
  }
}

async function postJson(input: {
  path: string;
  key: string;
  expectedSessionId: string;
  body: unknown;
}): Promise<Response> {
  return fetch(`${endpoint}/${input.path}`, {
    ...requestOptions,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.key,
      "X-Expected-Session-Id": input.expectedSessionId,
    },
    body: JSON.stringify(input.body),
  });
}

async function writeFailure(response: Response): Promise<WriteFailure> {
  if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
  if (response.status === 400 || response.status === 422) return { kind: "invalid" };
  if (response.status === 404) return { kind: "stale" };
  if (response.status !== 409) return { kind: "error" };
  const problem = problemResponseSchema.safeParse(await response.json().catch(() => undefined));
  return {
    kind: problem.success && problem.data.code === "session_changed" ? "session-changed" : "stale",
  };
}

export function prepareVoidInvoice({
  invoiceId,
  reason,
  expectedSessionId,
}: {
  invoiceId: string;
  reason: string;
  expectedSessionId: string;
}): { kind: "ready"; attempt: VoidAttempt } | { kind: "invalid" } {
  const input = adminVoidInvoiceInput.safeParse({ reason });
  if (!input.success) return { kind: "invalid" };
  return {
    kind: "ready",
    attempt: { invoiceId, reason: input.data.reason, key: crypto.randomUUID(), expectedSessionId },
  };
}

export async function voidInvoice(
  attempt: VoidAttempt,
): Promise<{ kind: "voided" } | WriteFailure> {
  try {
    const path = `invoices/${encodeURIComponent(attempt.invoiceId)}/void`;
    const response = await postJson({ ...attempt, path, body: { reason: attempt.reason } });
    if (!response.ok) return await writeFailure(response);
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
  expectedSessionId,
}: {
  proof: AdminTransferProof;
  invoice: AdminInvoice;
  reason: string;
  key: string;
  expectedSessionId: string;
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
    const response = await postJson({ path, key, expectedSessionId, body: input.data });
    if (!response.ok) return await writeFailure(response);
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
