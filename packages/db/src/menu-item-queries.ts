import type { TransactionSql } from "postgres";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { timestampParsers } from "./timestamp-parsers.js";

type ItemTag = "spicy" | "vegetarian" | "new" | "popular";

interface Translations {
  readonly ar?: string | undefined;
  readonly fr?: string | undefined;
  readonly en?: string | undefined;
}

export interface ItemData {
  readonly categoryId: string;
  readonly names: Translations;
  readonly descriptions: Translations;
  readonly priceDzd: number;
  readonly photoId: string | null;
  readonly tags: readonly ItemTag[];
  readonly extraPrepMinutes: number;
  readonly optionGroupIds: readonly string[];
}

export interface ItemAvailability {
  readonly itemId: string;
  readonly isAvailable: boolean;
  readonly soldOutUntil: string | null;
}

export interface MenuItem extends ItemData, ItemAvailability {
  readonly tags: ItemTag[];
  readonly optionGroupIds: string[];
  readonly moderationStatus: "unreviewed" | "approved" | "blocked_pending_review" | "rejected";
}

export interface ItemTarget {
  readonly merchantId: string;
  readonly itemId: string;
}

interface ItemCursor {
  readonly revision: number;
  readonly itemId: string;
}

export interface ItemPage extends MenuScope {
  readonly categoryId: string;
  readonly limit: number;
  readonly cursor?: ItemCursor | undefined;
  readonly now: Date;
}

type ItemRow = Omit<MenuItem, "soldOutUntil"> & { readonly soldOutUntil: Date | null };

function itemColumns(sql: TransactionSql, now: Date) {
  const at = now.toISOString();
  return sql`
    item.id AS "itemId", item.category_id AS "categoryId", item.names, item.descriptions,
    item.price_dzd AS "priceDzd", item.photo_media_id AS "photoId", item.tags, item.prep_extra_min AS "extraPrepMinutes",
    item.moderation_status AS "moderationStatus",
    CASE WHEN item.sold_out_until <= ${at}::timestamptz THEN true
      ELSE item.is_available END AS "isAvailable",
    CASE WHEN item.sold_out_until > ${at}::timestamptz THEN item.sold_out_until
      ELSE NULL END AS "soldOutUntil",
    coalesce((
      SELECT jsonb_agg(attachment.group_id ORDER BY attachment.sort)
      FROM public.item_option_groups AS attachment
      WHERE attachment.merchant_id = item.merchant_id AND attachment.item_id = item.id
    ), '[]'::jsonb) AS "optionGroupIds"
  `;
}

function presentItem(row: ItemRow): MenuItem {
  return { ...row, soldOutUntil: row.soldOutUntil?.toISOString() ?? null };
}

export async function readChangedItem(
  sql: TransactionSql,
  { merchantId, itemId, now }: ItemTarget & { readonly now: Date },
): Promise<MenuItem> {
  const [row] = await sql<ItemRow[]>`
    SELECT ${itemColumns(sql, now)} FROM public.items AS item
    WHERE item.merchant_id = ${merchantId} AND item.id = ${itemId} AND item.archived_at IS NULL
  `.parsers(timestampParsers);
  if (!row) throw new Error("Menu item write did not return an active item.");
  return presentItem(row);
}

async function readCategoryNames(
  sql: TransactionSql,
  { merchantId, categoryId }: Pick<ItemPage, "merchantId" | "categoryId">,
): Promise<Translations | undefined> {
  const [category] = await sql<{ names: Translations }[]>`
    SELECT names FROM public.categories WHERE merchant_id = ${merchantId} AND id = ${categoryId}
  `;
  return category?.names;
}

async function isCursorInCategory(
  sql: TransactionSql,
  { merchantId, categoryId }: Pick<ItemPage, "merchantId" | "categoryId">,
  cursor: ItemCursor,
): Promise<boolean> {
  const [item] = await sql`
    SELECT FROM public.items
    WHERE merchant_id = ${merchantId} AND category_id = ${categoryId}
      AND id = ${cursor.itemId} AND archived_at IS NULL
  `;
  return item !== undefined;
}

type ItemListResult =
  | {
      readonly kind: "listed";
      readonly revision: number;
      readonly context: { readonly restaurantName: string; readonly categoryNames: Translations };
      readonly items: MenuItem[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: "not_found" | "revision_conflict" | "invalid_cursor" };

export async function listItems(sql: TransactionSql, request: ItemPage): Promise<ItemListResult> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  const categoryNames = await readCategoryNames(sql, request);
  if (!categoryNames) return { kind: "not_found" };
  const { revision, restaurantName } = menu;
  const { merchantId, categoryId, limit, cursor, now } = request;
  if (cursor && cursor.revision !== revision) return { kind: "revision_conflict" };
  if (cursor && !(await isCursorInCategory(sql, request, cursor)))
    return { kind: "invalid_cursor" };

  const after = cursor ? sql`AND item.id > ${cursor.itemId}` : sql``;
  const rows = await sql<ItemRow[]>`
    SELECT ${itemColumns(sql, now)} FROM public.items AS item
    WHERE item.merchant_id = ${merchantId} AND item.category_id = ${categoryId}
      AND item.archived_at IS NULL ${after}
    ORDER BY item.id LIMIT ${limit + 1}
  `.parsers(timestampParsers);
  const items = rows.slice(0, limit).map(presentItem);
  const last = items.at(-1);
  const nextCursor = rows.length > limit && last ? revision.toString() + "~" + last.itemId : null;
  return {
    kind: "listed",
    revision,
    items,
    nextCursor,
    context: { restaurantName, categoryNames },
  };
}
