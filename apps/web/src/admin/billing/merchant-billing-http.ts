import {
  billingInvoiceListOutput,
  billingProofMediaOutput,
  billingProofUploadInput,
  billingProofUploadOutput,
  merchantBillingSubscriptionOutput,
  merchantTransferProofInput,
  merchantTransferProofOutput,
} from "@zaafran/contracts/billing";

// MER-22 merchant billing client. Shapes come from the published billing contract; routes are
// requested in docs/requests/lane-b-billing.md and mocked with MSW until lane A lands them.

type SubscriptionOutput = ReturnType<typeof merchantBillingSubscriptionOutput.parse>;
type InvoiceList = ReturnType<typeof billingInvoiceListOutput.parse>;
type TransferInput = ReturnType<typeof merchantTransferProofInput.parse>;
export type MerchantSubscription = NonNullable<SubscriptionOutput["subscription"]>;
export type MerchantInvoice = InvoiceList["invoices"][number];
export type TransferMethod = TransferInput["method"];
export type BillingBanner = "trial" | "due" | "past_due" | "suspended";
export type MerchantBillingResult =
  | {
      kind: "ready";
      subscription: MerchantSubscription | null;
      invoices: MerchantInvoice[];
      isOnlinePaymentEnabled: boolean;
    }
  | { kind: "sign-in" }
  | { kind: "not-found" }
  | { kind: "error" };
export type TransferResult =
  | { kind: "submitted" }
  | { kind: "invalid"; field: "reference" | "file" }
  | { kind: "rejected-photo" | "upload-expired" | "stale" | "sign-in" | "error" };
/** Keys stay the same across retries of one draft so the server can deduplicate them. */
export type TransferKeys = Readonly<{ reserveKey: string; submitKey: string }>;

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;
const readyPolls = 10;

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`billing request failed with ${String(status)}`);
  }
}

function merchantPath(merchantId: string, suffix: string): string {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/${suffix}`;
}

function invoicePath(merchantId: string, invoiceId: string, suffix: string): string {
  return merchantPath(merchantId, `invoices/${encodeURIComponent(invoiceId)}/${suffix}`);
}

export function invoicePdfUrl(merchantId: string, invoiceId: string): string {
  return invoicePath(merchantId, invoiceId, "pdf");
}

async function send(path: string, init: RequestInit = { method: "GET" }): Promise<unknown> {
  const response = await fetch(path, { ...requestOptions, ...init });
  if (!response.ok) throw new HttpStatusError(response.status);
  return response.json();
}

function failureKind(error: unknown): "sign-in" | "not-found" | "stale" | "error" {
  if (!(error instanceof HttpStatusError)) return "error";
  if (error.status === 401 || error.status === 403) return "sign-in";
  if (error.status === 404) return "not-found";
  return error.status === 409 ? "stale" : "error";
}

export async function loadMerchantBilling(
  merchantId: string,
  signal?: AbortSignal,
): Promise<MerchantBillingResult> {
  const init = { method: "GET", ...(signal && { signal }) };
  try {
    const [plan, invoices] = await Promise.all([
      send(merchantPath(merchantId, "billing"), init),
      send(`${merchantPath(merchantId, "invoices")}?limit=50`, init),
    ]);
    const output = merchantBillingSubscriptionOutput.parse(plan);
    const ownInvoices = billingInvoiceListOutput.parse(invoices).invoices;
    const isOwn = ownInvoices.every((invoice) => invoice.merchantId === merchantId);
    if (output.merchantId !== merchantId || !isOwn) return { kind: "error" };
    return {
      kind: "ready",
      subscription: output.subscription,
      invoices: ownInvoices,
      isOnlinePaymentEnabled: output.subscriptionOnlinePaymentEnabled,
    };
  } catch (error) {
    const kind = failureKind(error);
    // A 409 on a read is not a stale write; treat it as a load error.
    return { kind: kind === "stale" ? "error" : kind };
  }
}

/** MER-22: the banner the dashboard shows for the current plan. */
export function billingBanner(
  subscription: MerchantSubscription | null,
  invoices: readonly MerchantInvoice[],
): BillingBanner | undefined {
  if (subscription === null) return undefined;
  if (subscription.status === "trialing") return "trial";
  if (subscription.status === "past_due" || subscription.status === "suspended") {
    return subscription.status;
  }
  const hasOpenInvoice = invoices.some((invoice) => invoice.status === "issued");
  return subscription.status === "active" && hasOpenInvoice ? "due" : undefined;
}

function jsonPost(body: unknown, key: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  };
}

async function waitUntilReady(input: {
  statusPath: string;
  expiresAt: string;
  wait: () => Promise<void>;
}): Promise<"ready" | "rejected-photo" | "upload-expired"> {
  const expiresAtMs = Date.parse(input.expiresAt);
  for (let attempt = 0; attempt < readyPolls && Date.now() < expiresAtMs; attempt += 1) {
    const media = billingProofMediaOutput.parse(await send(input.statusPath));
    if (media.status === "ready") return "ready";
    if (media.status === "rejected") return "rejected-photo";
    await input.wait();
  }
  return "upload-expired";
}

async function uploadProof(input: {
  merchantId: string;
  invoiceId: string;
  file: Blob;
  contentType: ReturnType<typeof billingProofUploadInput.parse>["contentType"];
  wait: () => Promise<void>;
  keys: TransferKeys;
}): Promise<
  { kind: "ready"; proofMediaId: string } | { kind: "rejected-photo" | "upload-expired" | "error" }
> {
  const reservePath = invoicePath(input.merchantId, input.invoiceId, "proof-media");
  const body = { contentType: input.contentType, bytes: input.file.size };
  const reserved = billingProofUploadOutput.parse(
    await send(reservePath, jsonPost(body, input.keys.reserveKey)),
  );
  if (reserved.invoiceId !== input.invoiceId) return { kind: "error" };
  const statusPath = `${reservePath}/${encodeURIComponent(reserved.proofMediaId)}`;
  await send(`${statusPath}/content`, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: input.file,
  });
  const expiresAt = reserved.expiresAt;
  const status = await waitUntilReady({ statusPath, expiresAt, wait: input.wait });
  return status === "ready"
    ? { kind: "ready", proofMediaId: reserved.proofMediaId }
    : { kind: status };
}

/** MER-22 / BIL-05: upload transfer proof and submit it for admin confirmation. */
export async function submitTransferProof(input: {
  merchantId: string;
  invoiceId: string;
  method: TransferMethod;
  reference: string;
  file: File;
  keys: TransferKeys;
  wait: () => Promise<void>;
}): Promise<TransferResult> {
  const photo = billingProofUploadInput.safeParse({
    contentType: input.file.type,
    bytes: input.file.size,
  });
  if (!photo.success) return { kind: "invalid", field: "file" };
  const reference = merchantTransferProofInput.shape.reference.safeParse(input.reference);
  if (!reference.success) return { kind: "invalid", field: "reference" };
  try {
    const upload = await uploadProof({ ...input, contentType: photo.data.contentType });
    if (upload.kind !== "ready") return upload;
    const transfer = {
      method: input.method,
      reference: reference.data,
      proofMediaId: upload.proofMediaId,
    };
    const path = invoicePath(input.merchantId, input.invoiceId, "transfer-proofs");
    const output = merchantTransferProofOutput.parse(
      await send(path, jsonPost(transfer, input.keys.submitKey)),
    );
    return output.invoiceId === input.invoiceId ? { kind: "submitted" } : { kind: "error" };
  } catch (error) {
    const kind = failureKind(error);
    return { kind: kind === "not-found" ? "stale" : kind };
  }
}
