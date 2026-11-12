import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { TransactionSql } from "postgres";
import {
  menuItemIsOrderable,
  type ItemPage,
  type ItemTarget,
  type MenuItem,
} from "./menu-item-queries.js";

export type PreviewItem = Pick<
  MenuItem,
  "itemId" | "names" | "descriptions" | "priceDzd" | "photoId" | "tags" | "isAvailable"
>;

type PreviewCandidate = PreviewItem & {
  readonly moderationStatus: "unreviewed" | "approved";
  readonly optionTexts: string[];
};

interface PreviewItemScope extends ItemTarget {
  readonly now: Date;
  readonly categoryId?: string;
}

export function attachedOptionTexts(sql: TransactionSql) {
  return sql`ARRAY(
    SELECT translation.value FROM (
      SELECT groups.names
      FROM public.item_option_groups AS attachment
      JOIN public.option_groups AS groups ON groups.id = attachment.group_id
        AND groups.merchant_id = attachment.merchant_id
      WHERE attachment.merchant_id = item.merchant_id AND attachment.item_id = item.id
      UNION ALL
      SELECT option.names
      FROM public.item_option_groups AS attachment
      JOIN public.options AS option ON option.group_id = attachment.group_id
        AND option.merchant_id = attachment.merchant_id
      WHERE attachment.merchant_id = item.merchant_id AND attachment.item_id = item.id
    ) AS localized CROSS JOIN LATERAL jsonb_each_text(localized.names) AS translation
  )`;
}

function selectPreviewCandidates(sql: TransactionSql, now: Date) {
  return sql`
    SELECT item.id AS "itemId", item.names, item.descriptions, item.price_dzd AS "priceDzd",
      photo.id AS "photoId", item.tags,
      ${menuItemIsOrderable(sql, now)} AS "isAvailable",
      item.moderation_status AS "moderationStatus", ${attachedOptionTexts(sql)} AS "optionTexts"
    FROM public.items AS item
    JOIN public.categories AS category
      ON category.id = item.category_id AND category.merchant_id = item.merchant_id
    LEFT JOIN public.media_uploads AS photo ON photo.id = item.photo_id
      AND photo.merchant_id = item.merchant_id AND photo.kind = 'item' AND photo.status = 'ready'
    WHERE item.archived_at IS NULL AND item.moderation_status IN ('approved', 'unreviewed')
  `;
}

export function hasPublicMenuText({
  moderationStatus,
  names,
  descriptions,
  optionTexts,
}: Pick<PreviewCandidate, "moderationStatus" | "names" | "descriptions" | "optionTexts">) {
  if (findProhibitedGoods(optionTexts).length > 0) return false;
  if (moderationStatus === "approved") return true;
  // Older unreviewed rows can predate the text screen. Honor audited approvals above.
  const texts = [names, descriptions].flatMap(({ ar, fr, en }) => [ar ?? "", fr ?? "", en ?? ""]);
  return findProhibitedGoods(texts).length === 0;
}

function presentVisibleItem({
  moderationStatus,
  optionTexts,
  ...item
}: PreviewCandidate): PreviewItem | undefined {
  return hasPublicMenuText({ ...item, moderationStatus, optionTexts }) ? item : undefined;
}

export async function readVisibleItem(
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

export async function readPageWithLookahead(
  sql: TransactionSql,
  {
    merchantId,
    categoryId,
    limit,
    cursor,
    now,
  }: Pick<ItemPage, "merchantId" | "categoryId" | "limit" | "cursor" | "now">,
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
