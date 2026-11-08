import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { readCategoryNames, type ItemPage, type ItemTarget } from "./menu-item-queries.js";
import { readItemOptionGroups, type OptionGroup } from "./menu-option-group-queries.js";
import {
  readPageWithLookahead,
  readVisibleItem,
  type PreviewItem,
} from "./public-restaurant-items.js";

interface PreviewDetail extends MenuScope, ItemTarget {
  readonly expectedRevision: number;
  readonly now: Date;
}

type PreviewPageResult =
  | {
      readonly kind: "listed";
      readonly revision: number;
      readonly context: {
        readonly restaurantName: string;
        readonly categoryNames: PreviewItem["names"];
      };
      readonly items: PreviewItem[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: "not_found" | "revision_conflict" | "invalid_cursor" };

type PreviewDetailResult =
  | {
      readonly kind: "found";
      readonly revision: number;
      readonly item: PreviewItem;
      readonly optionGroups: OptionGroup[];
    }
  | { readonly kind: "not_found" | "revision_conflict" };

async function listPreview(sql: TransactionSql, request: ItemPage): Promise<PreviewPageResult> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  const categoryNames = await readCategoryNames(sql, request);
  if (!categoryNames) return { kind: "not_found" };
  const { revision, restaurantName } = menu;
  const { cursor, limit } = request;
  if (cursor && cursor.revision !== revision) return { kind: "revision_conflict" };
  if (cursor && !(await readVisibleItem(sql, { ...request, itemId: cursor.itemId })))
    return { kind: "invalid_cursor" };

  const visible = await readPageWithLookahead(sql, request);
  const items = visible.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    visible.length > limit && last ? revision.toString() + "~" + last.itemId : null;
  return {
    kind: "listed",
    revision,
    items,
    nextCursor,
    context: { restaurantName, categoryNames },
  };
}

async function getPreviewDetail(
  sql: TransactionSql,
  request: PreviewDetail,
): Promise<PreviewDetailResult> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  if (menu.revision !== request.expectedRevision) return { kind: "revision_conflict" };
  const item = await readVisibleItem(sql, request);
  if (!item) return { kind: "not_found" };
  const optionGroups = await readItemOptionGroups(sql, request);
  return { kind: "found", revision: menu.revision, item, optionGroups };
}

export function createMenuPreviewRepository({ sql }: DatabaseConnection) {
  const isolation = "isolation level repeatable read read only";
  return {
    list: (request: ItemPage) => sql.begin(isolation, (tx) => listPreview(tx, request)),
    detail: (request: PreviewDetail) => sql.begin(isolation, (tx) => getPreviewDetail(tx, request)),
  };
}
