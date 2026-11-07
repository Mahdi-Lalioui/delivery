import { listMenuCategories, type MenuCategory } from "../menu-category/menu-category-http";

export interface ItemCategoryRailRequest {
  merchantId: string;
  categoryId: string;
  expected: { sessionId: string; revision: number };
}

export type CategoryRailAccessFailure = "sign-in" | "forbidden" | "session-changed";
type CategoryRailRead =
  | { kind: "ready"; categories: MenuCategory[] }
  | { kind: CategoryRailAccessFailure | "revision-conflict" | "error" };

export async function loadItemCategoryRail({
  merchantId,
  categoryId,
  expected,
  signal,
}: ItemCategoryRailRequest & { signal: AbortSignal }): Promise<CategoryRailRead> {
  if (signal.aborted) return { kind: "error" };
  const result = await listMenuCategories({ merchantId, signal });
  if (result.kind !== "ready") return result;
  if (result.data.sessionId !== expected.sessionId) return { kind: "session-changed" };
  if (result.data.revision !== expected.revision) return { kind: "revision-conflict" };
  if (!result.data.categories.some((category) => category.categoryId === categoryId)) {
    return { kind: "error" };
  }
  return { kind: "ready", categories: result.data.categories };
}
