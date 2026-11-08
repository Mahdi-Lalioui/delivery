import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  type menuOptionGroupCreateInput,
  menuOptionGroupDetailOutput,
  menuOptionGroupPageOutput,
  type menuOptionGroupUpdateInput,
  menuOptionGroupWriteOutput,
} from "@zaafran/contracts/menu";

type GroupPage = ReturnType<typeof menuOptionGroupPageOutput.parse>;
type GroupDetail = ReturnType<typeof menuOptionGroupDetailOutput.parse>;
type GroupWrite = ReturnType<typeof menuOptionGroupWriteOutput.parse>;
export type OptionGroup = GroupDetail["optionGroup"];
export type GroupSnapshot = Omit<GroupPage, "nextCursor">;

export type OptionGroupCommand =
  | { kind: "create"; input: ReturnType<typeof menuOptionGroupCreateInput.parse> }
  | {
      kind: "edit";
      optionGroupId: string;
      input: ReturnType<typeof menuOptionGroupUpdateInput.parse>;
    };

type Conflict = "session-changed" | "revision-conflict";
type AccessFailure = "sign-in" | "forbidden";
type ReadFailure = { kind: Conflict | AccessFailure | "error" };
type WriteFailure =
  { kind: Conflict | AccessFailure } | { kind: "rate-limited" | "error"; shouldReuseKey: boolean };

export type LibraryRead = { kind: "ready"; data: GroupSnapshot } | ReadFailure;
type DetailRead = { kind: "ready"; data: OptionGroup } | ReadFailure;
export type LibraryWrite = { kind: "saved"; data: GroupWrite } | WriteFailure;

const privateRequest = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

function endpoint(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/menu/option-groups`;
}

async function classifyFailure(response: Response): Promise<WriteFailure> {
  if (response.status === 401) return { kind: "sign-in" };
  if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
  if (response.status === 429) return { kind: "rate-limited", shouldReuseKey: true };

  if (response.status === 409) {
    const body: unknown = await response.json().catch(() => undefined);
    const parsed = problemResponseSchema.safeParse(body);
    if (parsed.success && parsed.data.status === 409) {
      if (parsed.data.code === "session_changed") return { kind: "session-changed" };
      if (parsed.data.code === "revision_conflict") return { kind: "revision-conflict" };
    }
  }
  return { kind: "error", shouldReuseKey: response.status >= 500 };
}

interface ResponseSchema<Data> {
  safeParse(value: unknown): { success: true; data: Data } | { success: false };
}

async function request<Data>(
  path: string,
  options: RequestInit,
  schema: ResponseSchema<Data>,
): Promise<{ kind: "ok"; data: Data } | WriteFailure> {
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

function readFailure(failure: WriteFailure): ReadFailure {
  return { kind: "shouldReuseKey" in failure ? "error" : failure.kind };
}

function checkSnapshot(
  actual: { sessionId: string; revision: number },
  expected: { sessionId: string; revision: number },
): { kind: Conflict } | undefined {
  if (actual.sessionId !== expected.sessionId) return { kind: "session-changed" };
  if (actual.revision !== expected.revision) return { kind: "revision-conflict" };
  return undefined;
}

function completeList(page: GroupPage, optionGroups: GroupSnapshot["optionGroups"]): LibraryRead {
  const ids = new Set(optionGroups.map((group) => group.optionGroupId));
  if (ids.size !== optionGroups.length) return { kind: "error" };
  const { sessionId, revision, context } = page;
  return {
    kind: "ready",
    data: { sessionId, revision, optionGroups, ...(context && { context }) },
  };
}

export async function listOptionGroups({
  merchantId,
  signal,
}: {
  merchantId: string;
  signal: AbortSignal;
}): Promise<LibraryRead> {
  const query = new URLSearchParams({ limit: "100" });
  const cursors = new Set<string>();
  const optionGroups: GroupSnapshot["optionGroups"] = [];
  let firstPage: GroupPage | undefined;

  while (!signal.aborted) {
    const result = await request(
      `${endpoint(merchantId)}?${query.toString()}`,
      { method: "GET", signal },
      menuOptionGroupPageOutput,
    );
    if (result.kind !== "ok") return readFailure(result);

    const page = result.data;
    firstPage ??= page;
    const conflict = checkSnapshot(page, firstPage);
    if (conflict) return conflict;

    optionGroups.push(...page.optionGroups);
    const cursor = page.nextCursor;
    if (cursor === null) return completeList(firstPage, optionGroups);
    if (cursors.has(cursor)) return { kind: "error" };
    cursors.add(cursor);
    query.set("cursor", cursor);
  }
  return { kind: "error" };
}

export async function readOptionGroup({
  merchantId,
  optionGroupId,
  signal,
  sessionId,
  revision,
}: {
  merchantId: string;
  optionGroupId: string;
  signal: AbortSignal;
  sessionId: string;
  revision: number;
}): Promise<DetailRead> {
  const result = await request(
    `${endpoint(merchantId)}/${encodeURIComponent(optionGroupId)}`,
    { method: "GET", signal },
    menuOptionGroupDetailOutput,
  );
  if (result.kind !== "ok") return readFailure(result);

  const conflict = checkSnapshot(result.data, { sessionId, revision });
  if (conflict) return conflict;
  if (result.data.optionGroup.optionGroupId !== optionGroupId) return { kind: "error" };
  return { kind: "ready", data: result.data.optionGroup };
}

export async function saveOptionGroup({
  merchantId,
  sessionId,
  idempotencyKey,
  command,
}: {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
  command: OptionGroupCommand;
}): Promise<LibraryWrite> {
  const path =
    command.kind === "edit"
      ? `${endpoint(merchantId)}/${encodeURIComponent(command.optionGroupId)}`
      : endpoint(merchantId);
  const result = await request(
    path,
    {
      method: command.kind === "edit" ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "x-expected-session-id": sessionId,
      },
      body: JSON.stringify(command.input),
    },
    menuOptionGroupWriteOutput,
  );
  if (result.kind !== "ok") return result;

  if (command.kind === "edit" && result.data.optionGroup.optionGroupId !== command.optionGroupId) {
    return { kind: "error", shouldReuseKey: true };
  }
  return { kind: "saved", data: result.data };
}

export async function refreshOptionGroups({
  merchantId,
  signal,
  sessionId,
  minimumRevision,
}: {
  merchantId: string;
  signal: AbortSignal;
  sessionId: string;
  minimumRevision: number;
}): Promise<LibraryRead> {
  const result = await listOptionGroups({ merchantId, signal });
  if (result.kind !== "ready") return result;
  if (result.data.sessionId !== sessionId) return { kind: "session-changed" };
  if (result.data.revision < minimumRevision) return { kind: "revision-conflict" };
  return result;
}
