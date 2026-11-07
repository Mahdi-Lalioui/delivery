import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  menuCategoryOrderOutput,
  menuCategoryPageOutput,
  menuCategoryWriteOutput,
  type menuCategoryCommandInput,
  type menuCategoryOrderInput,
} from "@zaafran/contracts/menu";

type CategoryPage = ReturnType<typeof menuCategoryPageOutput.parse>;
export type MenuCategory = CategoryPage["categories"][number];
export type CategorySnapshot = Omit<CategoryPage, "nextCursor">;
export type CategoryInput = ReturnType<typeof menuCategoryCommandInput.parse>;
export type CategoryOrderInput = ReturnType<typeof menuCategoryOrderInput.parse>;
type Conflict = "session-changed" | "revision-conflict";
type AccessFailure = "sign-in" | "forbidden";
export type CategoryRead =
  { kind: "ready"; data: CategorySnapshot } | { kind: Conflict | AccessFailure | "error" };

type RequestFailure =
  | { kind: Conflict | AccessFailure }
  | { kind: "error" | "rate-limited" | "category-limit"; shouldReuseKey: boolean };

type RequestResult<Data> = { kind: "ok"; data: Data } | RequestFailure;

interface ResultSchema<Data> {
  safeParse(value: unknown): { success: true; data: Data } | { success: false };
}

const privateRequest = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function categoryEndpoint(merchantId: string): string {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/menu/categories`;
}

async function readConflict(response: Response): Promise<RequestFailure> {
  const body: unknown = await response.json().catch(() => undefined);
  const problem = problemResponseSchema.safeParse(body);
  if (!problem.success || problem.data.status !== 409) {
    return { kind: "error", shouldReuseKey: false };
  }
  if (problem.data.code === "session_changed") return { kind: "session-changed" };
  if (problem.data.code === "revision_conflict") return { kind: "revision-conflict" };
  if (problem.data.code === "category_limit")
    return { kind: "category-limit", shouldReuseKey: false };
  return { kind: "error", shouldReuseKey: false };
}

async function readFailure(response: Response): Promise<RequestFailure> {
  if (response.status === 401) return { kind: "sign-in" };
  if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
  if (response.status === 409) return await readConflict(response);
  if (response.status === 429) return { kind: "rate-limited", shouldReuseKey: true };
  return { kind: "error", shouldReuseKey: response.status >= 500 };
}

async function requestCategories<Data>({
  path,
  options,
  schema,
}: {
  path: string;
  options: RequestInit;
  schema: ResultSchema<Data>;
}): Promise<RequestResult<Data>> {
  try {
    const response = await fetch(path, { ...options, ...privateRequest });
    if (!response.ok) return await readFailure(response);

    const body: unknown = await response.json();
    const result = schema.safeParse(body);
    return result.success
      ? { kind: "ok", data: result.data }
      : { kind: "error", shouldReuseKey: true };
  } catch {
    return { kind: "error", shouldReuseKey: true };
  }
}

export async function listMenuCategories({
  merchantId,
  signal,
}: {
  merchantId: string;
  signal: AbortSignal;
}): Promise<CategoryRead> {
  const endpoint = categoryEndpoint(merchantId);
  const seenCursors = new Set<string>();
  const categories: MenuCategory[] = [];
  let firstPage: CategoryPage | undefined;
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor !== null) query.set("cursor", cursor);
    const result = await requestCategories({
      path: `${endpoint}?${query.toString()}`,
      options: { method: "GET", signal },
      schema: menuCategoryPageOutput,
    });
    if (result.kind !== "ok") return { kind: "shouldReuseKey" in result ? "error" : result.kind };

    const page = result.data;
    firstPage ??= page;
    if (firstPage.sessionId !== page.sessionId) return { kind: "session-changed" };
    if (firstPage.revision !== page.revision) return { kind: "revision-conflict" };

    categories.push(...page.categories);
    cursor = page.nextCursor;
    if (cursor === null) break;
    if (seenCursors.has(cursor)) return { kind: "error" };
    seenCursors.add(cursor);
  } while (!signal.aborted);

  return completeCategorySnapshot(firstPage, categories, signal);
}

function completeCategorySnapshot(
  firstPage: CategoryPage,
  categories: MenuCategory[],
  signal: AbortSignal,
): CategoryRead {
  const distinctIds = new Set(categories.map(({ categoryId }) => categoryId));
  if (signal.aborted || distinctIds.size !== categories.length) return { kind: "error" };
  return {
    kind: "ready",
    data: { sessionId: firstPage.sessionId, revision: firstPage.revision, categories },
  };
}

interface CommandIdentity {
  merchantId: string;
  sessionId: string;
  idempotencyKey: string;
}

function writeOptions({
  method,
  body,
  identity,
}: {
  method: "POST" | "PUT";
  body: CategoryInput | CategoryOrderInput;
  identity: CommandIdentity;
}): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": identity.idempotencyKey,
      "x-expected-session-id": identity.sessionId,
    },
    body: JSON.stringify(body),
  };
}

export function saveMenuCategory({
  categoryId,
  input,
  ...identity
}: CommandIdentity & { categoryId?: string; input: CategoryInput }) {
  const endpoint = categoryEndpoint(identity.merchantId);
  return requestCategories({
    path: categoryId ? `${endpoint}/${encodeURIComponent(categoryId)}` : endpoint,
    options: writeOptions({ method: categoryId ? "PUT" : "POST", body: input, identity }),
    schema: menuCategoryWriteOutput,
  });
}

export function saveMenuCategoryOrder({
  input,
  ...identity
}: CommandIdentity & { input: CategoryOrderInput }) {
  return requestCategories({
    path: `${categoryEndpoint(identity.merchantId)}/order`,
    options: writeOptions({ method: "PUT", body: input, identity }),
    schema: menuCategoryOrderOutput,
  });
}
