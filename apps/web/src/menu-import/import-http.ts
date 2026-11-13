import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  type menuImportApplyInput,
  menuImportApplyOutput,
  type menuImportInput,
  menuImportPreviewOutput,
} from "@zaafran/contracts/menu-import";

export type MenuImportInput = ReturnType<typeof menuImportInput.parse>;
export type MenuImportApplyInput = ReturnType<typeof menuImportApplyInput.parse>;
export type MenuImportPreview = ReturnType<typeof menuImportPreviewOutput.parse>;
export type MenuImportApplied = ReturnType<typeof menuImportApplyOutput.parse>;

type Rejection =
  | "session-changed"
  | "revision-conflict"
  | "invalid-preview"
  | "import-conflict"
  | "idempotency-conflict"
  | "invalid-rows"
  | "too-large"
  | "sign-in"
  | "forbidden";

type Failure = { kind: Rejection } | { kind: "error" | "rate-limited"; shouldReuseKey: boolean };

export type MenuImportFailureKind = Failure["kind"];
export type MenuImportPreviewResult =
  { kind: "ready"; data: MenuImportPreview } | { kind: MenuImportFailureKind };
export type MenuImportWrite = { kind: "saved"; data: MenuImportApplied } | Failure;

const privateRequest = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

const statusFailures = new Map<number, Rejection>([
  [401, "sign-in"],
  [403, "forbidden"],
  [404, "forbidden"],
  [413, "too-large"],
]);

const conflictCodes = new Map<string, Rejection>([
  ["session_changed", "session-changed"],
  ["revision_conflict", "revision-conflict"],
  ["invalid_preview_token", "invalid-preview"],
  ["import_conflict", "import-conflict"],
  ["idempotency_conflict", "idempotency-conflict"],
]);

function endpoint(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/menu/import`;
}

async function readProblemCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const result = problemResponseSchema.safeParse(body);
  return result.success && result.data.status === response.status ? result.data.code : undefined;
}

async function classifyFailure(response: Response): Promise<Failure> {
  const rejection = statusFailures.get(response.status);
  if (rejection) return { kind: rejection };
  if (response.status === 429) return { kind: "rate-limited", shouldReuseKey: true };

  const code = await readProblemCode(response);
  if (response.status === 400 && code === "invalid_import_rows") {
    return { kind: "invalid-rows" };
  }
  const conflict = response.status === 409 && code ? conflictCodes.get(code) : undefined;
  return conflict ? { kind: conflict } : { kind: "error", shouldReuseKey: response.status >= 500 };
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

export async function previewMenuImport({
  merchantId,
  sessionId,
  input,
  signal,
}: {
  merchantId: string;
  sessionId: string;
  input: MenuImportInput;
  signal: AbortSignal;
}): Promise<MenuImportPreviewResult> {
  const result = await request(
    endpoint(merchantId) + "/preview",
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    menuImportPreviewOutput,
  );
  if (result.kind !== "ok") return { kind: result.kind };
  const preview = result.data;
  if (preview.sessionId !== sessionId) return { kind: "session-changed" };
  if (preview.revision !== input.expectedRevision) return { kind: "revision-conflict" };
  if (preview.errors.some((error) => error.row > input.rows.length + 1)) {
    return { kind: "error" };
  }
  return { kind: "ready", data: preview };
}

export async function applyMenuImport({
  merchantId,
  sessionId,
  idempotencyKey,
  input,
}: {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
  input: MenuImportApplyInput;
}): Promise<MenuImportWrite> {
  const result = await request(
    endpoint(merchantId) + "/apply",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "x-expected-session-id": sessionId,
      },
      body: JSON.stringify(input),
    },
    menuImportApplyOutput,
  );
  return result.kind === "ok" ? { kind: "saved", data: result.data } : result;
}
