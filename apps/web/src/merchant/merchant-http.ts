import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  communeListOutput,
  merchantApplicationOutput,
  merchantMembershipsOutput,
  type merchantApplicationInput,
} from "@zaafran/contracts/merchant";

export type Commune = ReturnType<typeof communeListOutput.parse>["communes"][number];
type MerchantAccount = ReturnType<typeof merchantMembershipsOutput.parse>;
export type Membership = MerchantAccount["memberships"][number];
export type Application = ReturnType<typeof merchantApplicationInput.parse>;
type ApplicationReceipt = ReturnType<typeof merchantApplicationOutput.parse>;

export type MerchantRead<Data> =
  | { kind: "ready"; data: Data }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "error" };

export type ApplicationError =
  | "submitError"
  | "invalidCommune"
  | "outsideCommune"
  | "photosUnavailable"
  | "rateLimited"
  | "signInRequired"
  | "forbidden";

type ApplicationResult =
  | { kind: "created"; data: ApplicationReceipt }
  | { kind: "session-changed" }
  | { kind: "error"; error: ApplicationError; shouldReuseKey: boolean };

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

async function readMerchant<Data>({
  path,
  signal,
  schema,
}: {
  path: string;
  signal: AbortSignal;
  schema: { safeParse(value: unknown): { success: true; data: Data } | { success: false } };
}): Promise<MerchantRead<Data>> {
  try {
    const response = await fetch(path, { ...requestOptions, method: "GET", signal });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };

    const payload: unknown = await response.json();
    const result = schema.safeParse(payload);
    return result.success ? { kind: "ready", data: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function listAlgiersCommunes(signal: AbortSignal): Promise<MerchantRead<Commune[]>> {
  const communes: Commune[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ wilayaCode: "16", limit: "100" });
    if (cursor !== null) query.set("cursor", cursor);
    const page = await readMerchant({
      path: `/v1/communes?${query.toString()}`,
      signal,
      schema: communeListOutput,
    });
    if (page.kind !== "ready") return page;

    communes.push(...page.data.communes.filter(({ wilayaCode }) => wilayaCode === 16));
    cursor = page.data.nextCursor;
    if (cursor === null) break;
    if (!/^[0-9]{4}$/.test(cursor) || seenCursors.has(cursor)) return { kind: "error" };
    seenCursors.add(cursor);
  } while (!signal.aborted);

  return { kind: "ready", data: communes };
}

export function listMerchantMemberships(
  signal: AbortSignal,
): Promise<MerchantRead<MerchantAccount>> {
  return readMerchant({
    path: "/v1/me/merchants",
    signal,
    schema: merchantMembershipsOutput,
  });
}

function rejected(error: ApplicationError, shouldReuseKey = false): ApplicationResult {
  return { kind: "error", error, shouldReuseKey };
}

async function readApplicationError(response: Response): Promise<ApplicationResult> {
  if (response.status === 401) return rejected("signInRequired");
  if (response.status === 403) return rejected("forbidden");
  if (response.status === 429) return rejected("rateLimited", true);
  if (response.status === 409 || response.status === 422)
    return await readApplicationProblem(response);
  return rejected("submitError", response.status >= 500);
}

async function readApplicationProblem(response: Response): Promise<ApplicationResult> {
  const payload: unknown = await response.json().catch(() => undefined);
  const result = problemResponseSchema.safeParse(payload);
  if (!result.success || result.data.status !== response.status) return rejected("submitError");
  if (response.status === 409) {
    if (result.data.code === "session_changed") return { kind: "session-changed" };
    return rejected(
      result.data.code === "photos_unavailable" ? "photosUnavailable" : "submitError",
    );
  }
  if (result.data.code === "invalid_commune") return rejected("invalidCommune");
  if (result.data.code === "outside_commune") return rejected("outsideCommune");
  return rejected("submitError");
}

export async function submitMerchantApplication({
  application,
  expectedSessionId,
  idempotencyKey,
}: {
  application: Application;
  expectedSessionId: MerchantAccount["sessionId"];
  idempotencyKey: string;
}): Promise<ApplicationResult> {
  try {
    const response = await fetch("/v1/merchant-applications", {
      ...requestOptions,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "x-expected-session-id": expectedSessionId,
      },
      body: JSON.stringify(application),
    });
    if (response.status !== 201) return await readApplicationError(response);
    const payload: unknown = await response.json();
    const result = merchantApplicationOutput.safeParse(payload);
    return result.success ? { kind: "created", data: result.data } : rejected("submitError", true);
  } catch {
    return rejected("submitError", true);
  }
}
