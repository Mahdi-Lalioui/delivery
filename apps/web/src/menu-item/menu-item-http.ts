import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuItemArchiveOutput,
  menuItemAvailabilityOutput,
  menuItemPageOutput,
  menuItemWriteOutput,
  type menuItemAvailabilityInput,
  type menuItemCommandInput,
  type menuItemRevisionInput,
} from "@zaafran/contracts/menu";

type ItemPage = ReturnType<typeof menuItemPageOutput.parse>;
export type MenuItem = ItemPage["items"][number];
type ItemSnapshot = Omit<ItemPage, "nextCursor">;
export type ItemInput = ReturnType<typeof menuItemCommandInput.parse>;
type RevisionInput = ReturnType<typeof menuItemRevisionInput.parse>;
type AvailabilityInput = ReturnType<typeof menuItemAvailabilityInput.parse>;
export type ItemAvailability = AvailabilityInput["availability"];

export type MenuItemCommand =
  | { kind: "create"; input: ItemInput }
  | { kind: "edit"; itemId: string; input: ItemInput }
  | { kind: "duplicate" | "archive"; itemId: string; input: RevisionInput }
  | { kind: "availability"; itemId: string; input: AvailabilityInput };

type AccessFailure = "sign-in" | "forbidden" | "session-changed" | "revision-conflict";
type RequestFailure =
  { kind: AccessFailure } | { kind: "error" | "rate-limited"; shouldReuseKey: boolean };

export type ItemRead = { kind: "ready"; data: ItemSnapshot } | { kind: AccessFailure | "error" };
export type ItemWrite =
  | { kind: "saved"; data: ReturnType<typeof menuItemWriteOutput.parse> }
  | { kind: "archived"; data: ReturnType<typeof menuItemArchiveOutput.parse> }
  | { kind: "availability"; data: ReturnType<typeof menuItemAvailabilityOutput.parse> }
  | RequestFailure;

const privateRequest = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function itemEndpoint(merchantId: string): string {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/menu/items`;
}

async function readFailure(response: Response): Promise<RequestFailure> {
  if (response.status === 401) return { kind: "sign-in" };
  if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
  if (response.status === 429) return { kind: "rate-limited", shouldReuseKey: true };
  if (response.status === 409) {
    const body: unknown = await response.json().catch(() => undefined);
    const problem = problemResponseSchema.safeParse(body);
    if (problem.success && problem.data.status === 409) {
      if (problem.data.code === "session_changed") return { kind: "session-changed" };
      if (problem.data.code === "revision_conflict") return { kind: "revision-conflict" };
    }
  }
  return { kind: "error", shouldReuseKey: response.status >= 500 };
}

interface ResultSchema<Data> {
  safeParse(value: unknown): { success: true; data: Data } | { success: false };
}

async function requestItemData<Kind extends string, Data>(
  path: string,
  options: RequestInit,
  { kind, schema }: { kind: Kind; schema: ResultSchema<Data> },
): Promise<{ kind: Kind; data: Data } | RequestFailure> {
  try {
    const response = await fetch(path, { ...options, ...privateRequest });
    if (!response.ok) return await readFailure(response);
    const body: unknown = await response.json();
    const result = schema.safeParse(body);
    if (result.success) return { kind, data: result.data };
  } catch {
    return { kind: "error", shouldReuseKey: true };
  }
  return { kind: "error", shouldReuseKey: true };
}

function completeList(page: ItemPage, items: MenuItem[], categoryId: string): ItemRead {
  const distinctIds = new Set(items.map(({ itemId }) => itemId));
  if (distinctIds.size !== items.length || items.some((item) => item.categoryId !== categoryId)) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    data: { sessionId: page.sessionId, revision: page.revision, context: page.context, items },
  };
}

export async function listMenuItems({
  merchantId,
  categoryId,
  signal,
}: {
  merchantId: string;
  categoryId: string;
  signal: AbortSignal;
}): Promise<ItemRead> {
  const endpoint = itemEndpoint(merchantId);
  const seenCursors = new Set<string>();
  const items: MenuItem[] = [];
  const query = new URLSearchParams({ categoryId, limit: "100" });
  let firstPage: ItemPage | undefined;

  while (!signal.aborted) {
    const result = await requestItemData(
      `${endpoint}?${query.toString()}`,
      { method: "GET", signal },
      { kind: "page", schema: menuItemPageOutput },
    );
    if (result.kind !== "page") {
      return { kind: "shouldReuseKey" in result ? "error" : result.kind };
    }

    const page = result.data;
    firstPage ??= page;
    if (firstPage.sessionId !== page.sessionId) return { kind: "session-changed" };
    if (firstPage.revision !== page.revision) return { kind: "revision-conflict" };
    items.push(...page.items);

    const cursor = page.nextCursor;
    if (cursor === null) return completeList(firstPage, items, categoryId);
    if (seenCursors.has(cursor)) return { kind: "error" };
    seenCursors.add(cursor);
    query.set("cursor", cursor);
  }

  return { kind: "error" };
}

export function writeMenuItem({
  merchantId,
  sessionId,
  idempotencyKey,
  command,
}: {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
  command: MenuItemCommand;
}): Promise<ItemWrite> {
  const endpoint = itemEndpoint(merchantId);
  const options = {
    method: command.kind === "edit" || command.kind === "availability" ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "x-expected-session-id": sessionId,
    },
    body: JSON.stringify(command.input),
  };
  if (command.kind === "create") {
    return requestItemData(endpoint, options, { kind: "saved", schema: menuItemWriteOutput });
  }

  const item = `${endpoint}/${encodeURIComponent(command.itemId)}`;
  switch (command.kind) {
    case "edit":
      return requestItemData(item, options, { kind: "saved", schema: menuItemWriteOutput });
    case "duplicate":
      return requestItemData(`${item}/duplicate`, options, {
        kind: "saved",
        schema: menuItemWriteOutput,
      });
    case "archive":
      return requestItemData(`${item}/archive`, options, {
        kind: "archived",
        schema: menuItemArchiveOutput,
      });
    case "availability":
      return requestItemData(`${item}/availability`, options, {
        kind: "availability",
        schema: menuItemAvailabilityOutput,
      });
  }
}

export async function refreshMenuItems({
  merchantId,
  categoryId,
  signal,
  sessionId,
  minimumRevision,
}: {
  merchantId: string;
  categoryId: string;
  signal: AbortSignal;
  sessionId: string;
  minimumRevision: number;
}): Promise<ItemRead> {
  const result = await listMenuItems({ merchantId, categoryId, signal });
  if (result.kind !== "ready") return result;
  if (result.data.sessionId !== sessionId) return { kind: "session-changed" };
  if (result.data.revision < minimumRevision) return { kind: "revision-conflict" };
  return result;
}
