import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { timestampParsers } from "./timestamp-parsers.js";

interface Translations {
  readonly ar?: string | undefined;
  readonly fr?: string | undefined;
  readonly en?: string | undefined;
}

interface PreviewItem {
  readonly itemId: string;
  readonly names: Translations;
  readonly descriptions: Translations;
  readonly priceDzd: number;
  readonly tags: string[];
  readonly isAvailable: boolean;
  readonly soldOutUntil: string | null;
}

interface PreviewCategory {
  readonly categoryId: string;
  readonly names: Translations;
  readonly items: PreviewItem[];
}

type PreviewRequest = MenuScope & { readonly now: Date };

type PreviewResult =
  | {
      readonly kind: "previewed";
      readonly revision: number;
      readonly restaurantName: string;
      readonly categories: PreviewCategory[];
    }
  | { readonly kind: "not_found" };

type ItemRow = Omit<PreviewItem, "soldOutUntil"> & {
  readonly categoryId: string;
  readonly soldOutUntil: Date | null;
};

// Customers may only ever see active items that moderation has not held or rejected (§17.3).
async function readListableItems(
  sql: TransactionSql,
  { merchantId, now }: PreviewRequest,
): Promise<ItemRow[]> {
  const at = now.toISOString();
  return sql<ItemRow[]>`
    SELECT item.id AS "itemId", item.category_id AS "categoryId", item.names, item.descriptions,
      item.price_dzd AS "priceDzd", item.tags,
      CASE WHEN item.sold_out_until <= ${at}::timestamptz THEN true
        ELSE item.is_available END AS "isAvailable",
      CASE WHEN item.sold_out_until > ${at}::timestamptz THEN item.sold_out_until
        ELSE NULL END AS "soldOutUntil"
    FROM public.items AS item
    WHERE item.merchant_id = ${merchantId} AND item.archived_at IS NULL
      AND item.moderation_status IN ('approved', 'unreviewed')
    ORDER BY item.category_id, item.id
  `.parsers(timestampParsers);
}

async function readCategories(sql: TransactionSql, { merchantId }: MenuScope) {
  return sql<{ categoryId: string; names: Translations }[]>`
    SELECT id AS "categoryId", names FROM public.categories
    WHERE merchant_id = ${merchantId} ORDER BY sort
  `;
}

function groupByCategory(
  categories: readonly { categoryId: string; names: Translations }[],
  rows: readonly ItemRow[],
): PreviewCategory[] {
  const itemsByCategory = new Map<string, PreviewItem[]>();
  for (const { categoryId, soldOutUntil, ...item } of rows) {
    const items = itemsByCategory.get(categoryId) ?? [];
    items.push({ ...item, soldOutUntil: soldOutUntil?.toISOString() ?? null });
    itemsByCategory.set(categoryId, items);
  }
  return categories.flatMap((category) => {
    const items = itemsByCategory.get(category.categoryId);
    return items ? [{ ...category, items }] : [];
  });
}

async function readPreview(sql: TransactionSql, request: PreviewRequest): Promise<PreviewResult> {
  const menu = await readMenuContext(sql, request);
  if (!menu) return { kind: "not_found" };
  const categories = await readCategories(sql, request);
  const rows = await readListableItems(sql, request);
  return {
    kind: "previewed",
    revision: menu.revision,
    restaurantName: menu.restaurantName,
    categories: groupByCategory(categories, rows),
  };
}

export function createMenuPreviewRepository({ sql }: DatabaseConnection) {
  return {
    read: (request: PreviewRequest) =>
      sql.begin("isolation level repeatable read read only", (tx) => readPreview(tx, request)),
  };
}
