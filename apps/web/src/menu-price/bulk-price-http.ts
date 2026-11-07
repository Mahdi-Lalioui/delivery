import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  type bulkPriceApplyInput,
  bulkPriceApplyOutput,
  type bulkPricePreviewInput,
  bulkPricePreviewOutput,
  bulkPriceUndoOutput,
} from "@zaafran/contracts/menu-price";

export type BulkPriceSelection = ReturnType<typeof bulkPricePreviewInput.parse>;
type ApplyInput = ReturnType<typeof bulkPriceApplyInput.parse>;
type Preview = ReturnType<typeof bulkPricePreviewOutput.parse>;
type Batch = ReturnType<typeof bulkPriceApplyOutput.parse>;

type Conflict =
  "session-changed" | "revision-conflict" | "undo-expired" | "price-changed" | "already-undone";
type Rejection = Conflict | "sign-in" | "forbidden" | "invalid-change";
type Failure = { kind: Rejection } | { kind: "rate-limited" | "error"; shouldReuseKey: boolean };

type PreviewRead = { kind: "ready"; data: Preview } | { kind: Rejection | "error" };
export type BulkPriceWrite = { kind: "saved"; data: Batch } | Failure;

const privateRequest = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

const conflictCodes = new Map<string, Conflict>([
  ["session_changed", "session-changed"],
  ["revision_conflict", "revision-conflict"],
  ["undo_window_expired", "undo-expired"],
  ["price_changed_since_apply", "price-changed"],
  ["price_change_already_undone", "already-undone"],
]);

function endpoint(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/menu/prices`;
}

async function readProblemCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = problemResponseSchema.safeParse(body);
  return parsed.success && parsed.data.status === response.status ? parsed.data.code : undefined;
}

async function classifyFailure(response: Response): Promise<Failure> {
  if (response.status === 401) return { kind: "sign-in" };
  if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
  if (response.status === 429) return { kind: "rate-limited", shouldReuseKey: true };
  const code = await readProblemCode(response);
  if (response.status === 400 && code === "invalid_bulk_price_change") {
    return { kind: "invalid-change" };
  }
  const conflict = response.status === 409 && code ? conflictCodes.get(code) : undefined;
  if (conflict) return { kind: conflict };
  return { kind: "error", shouldReuseKey: response.status >= 500 };
}

interface ResponseSchema<Data> {
  safeParse(value: unknown): { success: true; data: Data } | { success: false };
}

async function request<Data>(
  path: string,
  options: RequestInit,
  schema: ResponseSchema<Data>,
): Promise<{ kind: "ok"; data: Data } | Failure> {
  try {
    const response = await fetch(path, { ...options, ...privateRequest });
    if (!response.ok) return await classifyFailure(response);
    const body: unknown = await response.json();
    const result = schema.safeParse(body);
    if (result.success) return { kind: "ok", data: result.data };
  } catch {
    return { kind: "error", shouldReuseKey: true };
  }
  return { kind: "error", shouldReuseKey: true };
}

function coversExactly(items: readonly { itemId: string }[], itemIds: readonly string[]) {
  const returned = new Set(items.map((item) => item.itemId.toLowerCase()));
  return (
    returned.size === items.length &&
    items.length === itemIds.length &&
    itemIds.every((itemId) => returned.has(itemId.toLowerCase()))
  );
}

function commandHeaders(sessionId: string, idempotencyKey: string) {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "x-expected-session-id": sessionId,
  };
}

export async function previewBulkPrices({
  merchantId,
  selection,
  signal,
}: {
  merchantId: string;
  selection: BulkPriceSelection;
  signal: AbortSignal;
}): Promise<PreviewRead> {
  const result = await request(
    endpoint(merchantId) + "/preview",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    },
    bulkPricePreviewOutput,
  );
  if (result.kind !== "ok") return "shouldReuseKey" in result ? { kind: "error" } : result;
  if (!coversExactly(result.data.items, selection.itemIds)) return { kind: "error" };
  return { kind: "ready", data: result.data };
}

export async function applyBulkPrices({
  merchantId,
  sessionId,
  idempotencyKey,
  input,
}: {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
  input: ApplyInput;
}): Promise<BulkPriceWrite> {
  const result = await request(
    endpoint(merchantId) + "/apply",
    {
      method: "POST",
      headers: commandHeaders(sessionId, idempotencyKey),
      body: JSON.stringify(input),
    },
    bulkPriceApplyOutput,
  );
  if (result.kind !== "ok") return result;
  if (!coversExactly(result.data.items, input.itemIds)) {
    return { kind: "error", shouldReuseKey: true };
  }
  return { kind: "saved", data: result.data };
}

export async function undoBulkPrices({
  merchantId,
  sessionId,
  idempotencyKey,
  batchId,
  expectedRevision,
}: {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
  batchId: string;
  expectedRevision: number;
}): Promise<BulkPriceWrite> {
  const result = await request(
    `${endpoint(merchantId)}/batches/${encodeURIComponent(batchId)}/undo`,
    {
      method: "POST",
      headers: commandHeaders(sessionId, idempotencyKey),
      body: JSON.stringify({ expectedRevision }),
    },
    bulkPriceUndoOutput,
  );
  if (result.kind !== "ok") return result;
  if (result.data.batchId.toLowerCase() !== batchId.toLowerCase()) {
    return { kind: "error", shouldReuseKey: true };
  }
  return { kind: "saved", data: result.data };
}
