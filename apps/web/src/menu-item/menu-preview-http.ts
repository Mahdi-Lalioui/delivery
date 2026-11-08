import { menuPreviewDetailOutput, menuPreviewPageOutput } from "@zaafran/contracts/menu";
import type { CategoryRailAccessFailure } from "./item-category-rail";
import { requestItemData } from "./menu-item-http";

export type PreviewPage = ReturnType<typeof menuPreviewPageOutput.parse>;
type PreviewDetail = ReturnType<typeof menuPreviewDetailOutput.parse>;
export type PreviewItem = PreviewPage["items"][number];
export type PreviewOptionGroup = PreviewDetail["optionGroups"][number];
export type PreviewFailure = CategoryRailAccessFailure | "revision-conflict" | "error";

export interface PreviewScope {
  merchantId: string;
  expected: { sessionId: string; revision: number };
}

type PreviewRequest = PreviewScope & { signal: AbortSignal };

function endpoint(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/menu/preview/items`;
}

function validateSnapshot<Data extends PreviewScope["expected"]>(
  data: Data,
  { expected }: PreviewScope,
): { kind: "ready"; data: Data } | { kind: "session-changed" | "revision-conflict" } {
  if (data.sessionId !== expected.sessionId) return { kind: "session-changed" };
  if (data.revision !== expected.revision) return { kind: "revision-conflict" };
  return { kind: "ready", data };
}

async function readPreview<Data extends PreviewScope["expected"]>(
  path: string,
  scope: PreviewRequest,
  schema: { safeParse(value: unknown): { success: true; data: Data } | { success: false } },
): Promise<{ kind: "ready"; data: Data } | { kind: PreviewFailure }> {
  const { signal } = scope;
  const result = await requestItemData(path, { method: "GET", signal }, { kind: "ready", schema });
  if (signal.aborted || "shouldReuseKey" in result) return { kind: "error" };
  return result.kind === "ready" ? validateSnapshot(result.data, scope) : result;
}

export function readMenuPreviewPage({
  categoryId,
  cursor,
  ...scope
}: PreviewRequest & { categoryId: string; cursor?: string }) {
  const query = new URLSearchParams({ categoryId, limit: "24" });
  if (cursor !== undefined) query.set("cursor", cursor);
  const path = `${endpoint(scope.merchantId)}?${query.toString()}`;
  return readPreview(path, scope, menuPreviewPageOutput);
}

export async function readMenuPreviewDetail({
  itemId,
  ...scope
}: PreviewRequest & { itemId: string }) {
  const query = new URLSearchParams({ expectedRevision: String(scope.expected.revision) });
  const path = `${endpoint(scope.merchantId)}/${encodeURIComponent(itemId)}?${query.toString()}`;
  const result = await readPreview(path, scope, menuPreviewDetailOutput);
  if (result.kind === "ready" && result.data.item.itemId !== itemId)
    return { kind: "error" } as const;
  return result;
}

export function mergePreviewPages(previous: PreviewPage | null, page: PreviewPage) {
  if (
    page.nextCursor !== null &&
    (page.nextCursor === previous?.nextCursor || !page.items.length)
  ) {
    return undefined;
  }
  const items = previous ? [...previous.items, ...page.items] : page.items;
  const ids = new Set(items.map((item) => item.itemId));
  return ids.size === items.length ? { ...page, items } : undefined;
}
