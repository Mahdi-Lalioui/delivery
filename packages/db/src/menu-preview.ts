import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import {
  itemIsAvailable,
  readCategoryNames,
  type ItemPage,
  type ItemTarget,
  type MenuItem,
} from "./menu-item-queries.js";
import { readItemOptionGroups, type OptionGroup } from "./menu-option-group-queries.js";

type PreviewItem = Pick<
  MenuItem,
  "itemId" | "names" | "descriptions" | "priceDzd" | "photoId" | "tags" | "isAvailable"
>;

type PreviewCandidate = PreviewItem & { readonly moderationStatus: "unreviewed" | "approved" };

interface PreviewItemScope extends ItemTarget {
  readonly now: Date;
  readonly categoryId?: string;
}

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
        readonly categoryNames: MenuItem["names"];
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

function selectPreviewCandidates(sql: TransactionSql, now: Date) {
  return sql`
    SELECT item.id AS "itemId", item.names, item.descriptions, item.price_dzd AS "priceDzd",
      photo.id AS "photoId", item.tags, ${itemIsAvailable(sql, now)} AS "isAvailable",
      item.moderation_status AS "moderationStatus"
    FROM public.items AS item
    LEFT JOIN public.media_uploads AS photo ON photo.id = item.photo_id
      AND photo.merchant_id = item.merchant_id AND photo.kind = 'item' AND photo.status = 'ready'
    WHERE item.archived_at IS NULL AND item.moderation_status IN ('approved', 'unreviewed')
  `;
}

function presentVisibleItem({
  moderationStatus,
  ...item
}: PreviewCandidate): PreviewItem | undefined {
  if (moderationStatus === "approved") return item;
  // Older unreviewed rows can predate the text screen. Honor audited approvals above.
  const texts = [item.names, item.descriptions].flatMap(({ ar, fr, en }) => [
    ar ?? "",
    fr ?? "",
    en ?? "",
  ]);
  return findProhibitedGoods(texts).length === 0 ? item : undefined;
}

async function readVisibleItem(
  sql: TransactionSql,
  { merchantId, itemId, categoryId, now }: PreviewItemScope,
): Promise<PreviewItem | undefined> {
  const category = categoryId === undefined ? sql`` : sql`AND item.category_id = ${categoryId}`;
  const [candidate] = await sql<PreviewCandidate[]>`
    ${selectPreviewCandidates(sql, now)}
    AND item.merchant_id = ${merchantId} AND item.id = ${itemId} ${category}
  `;
  return candidate && presentVisibleItem(candidate);
}

async function readPageWithLookahead(
  sql: TransactionSql,
  { merchantId, categoryId, limit, cursor, now }: ItemPage,
): Promise<PreviewItem[]> {
  const batchSize = Math.max(32, limit + 1);
  const items: PreviewItem[] = [];
  let after = cursor?.itemId;
  // Fill the page with visible items even when the legacy screen drops entire batches.
  while (items.length <= limit) {
    const beyond = after === undefined ? sql`` : sql`AND item.id > ${after}`;
    const batch = await sql<PreviewCandidate[]>`
      ${selectPreviewCandidates(sql, now)}
      AND item.merchant_id = ${merchantId} AND item.category_id = ${categoryId} ${beyond}
      ORDER BY item.id LIMIT ${batchSize}
    `;
    items.push(...batch.map(presentVisibleItem).filter((item) => item !== undefined));
    if (batch.length < batchSize) break;
    after = batch.at(-1)?.itemId;
  }
  return items;
}

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
