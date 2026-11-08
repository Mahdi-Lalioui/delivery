import { findProhibitedGoods } from "@zaafran/domain/moderation";
import type { TransactionSql } from "postgres";
import { lockReadyPhotos } from "./media-access.js";
import type { CommandChange, CommandRequest } from "./menu-commands.js";
import {
  readChangedItem,
  type ItemAvailability,
  type ItemData,
  type ItemTarget,
  type MenuItem,
} from "./menu-item-queries.js";
import { timestampParsers } from "./timestamp-parsers.js";

interface RevisionInput {
  readonly expectedRevision: number;
}

export type ItemWrite = CommandRequest<ItemData & RevisionInput>;
export type ItemUpdate = CommandRequest<ItemData & RevisionInput & { removePhoto?: true }> &
  ItemTarget;
export type ItemRevision = CommandRequest<RevisionInput> & ItemTarget;
export type ItemAvailabilityWrite = CommandRequest<
  RevisionInput & { readonly availability: "available" | "end_of_day" | "indefinite" }
> &
  ItemTarget;

type ItemEditChange = CommandChange<
  { readonly item: MenuItem },
  "not_found" | "photos_unavailable" | "moderation_pending"
>;

async function lockItemReferences(
  sql: TransactionSql,
  { merchantId, input }: ItemWrite,
): Promise<boolean> {
  const { categoryId, optionGroupIds } = input;
  const [category] = await sql`
    SELECT id FROM public.categories WHERE merchant_id = ${merchantId} AND id = ${categoryId}
    FOR KEY SHARE
  `;
  if (!category) return false;

  const groups = await sql`
    SELECT id FROM public.option_groups
    WHERE merchant_id = ${merchantId} AND id = ANY(${[...optionGroupIds]}::uuid[])
    ORDER BY id FOR KEY SHARE
  `;
  return groups.length === optionGroupIds.length;
}

async function lockEditableItem(
  sql: TransactionSql,
  { merchantId, itemId }: ItemTarget,
  { names, descriptions }: { names: string; descriptions: string },
) {
  const [item] = await sql<{ photoId: string | null; heldTextChanged: boolean }[]>`
    SELECT photo_id AS "photoId",
      moderation_status = 'blocked_pending_review' AND
      (names IS DISTINCT FROM ${names}::jsonb OR descriptions IS DISTINCT FROM ${descriptions}::jsonb)
      AS "heldTextChanged"
    FROM public.items
    WHERE merchant_id = ${merchantId} AND id = ${itemId} AND archived_at IS NULL
    FOR NO KEY UPDATE
  `;
  return item;
}

async function lockNewItemPhoto(
  sql: TransactionSql,
  { accountId, merchantId, input }: ItemWrite,
  currentPhotoId: string | null = null,
): Promise<boolean> {
  const { photoId } = input;
  if (photoId === null || photoId.toLowerCase() === currentPhotoId) return true;
  return lockReadyPhotos(sql, { accountId, merchantId, kind: "item", photoIds: [photoId] });
}

async function insertItemGroups(
  sql: TransactionSql,
  { merchantId, itemId }: ItemTarget,
  optionGroupIds: readonly string[],
): Promise<void> {
  if (optionGroupIds.length === 0) return;
  await sql`
    INSERT INTO public.item_option_groups (merchant_id, item_id, group_id, sort)
    SELECT ${merchantId}::uuid, ${itemId}::uuid, attachment.id, (attachment.position - 1)::smallint
    FROM unnest(${[...optionGroupIds]}::uuid[]) WITH ORDINALITY AS attachment(id, position)
  `;
}

type TextStatus = "unreviewed" | "blocked_pending_review";
type ItemText = Pick<ItemData, "names" | "descriptions">;

/** SPEC §17.3: names or descriptions with prohibited goods wait for an admin review. */
function screenItemText({ names, descriptions }: ItemText): TextStatus {
  const texts = [names, descriptions].flatMap(({ ar, fr, en }) => [ar ?? "", fr ?? "", en ?? ""]);
  return findProhibitedGoods(texts).length > 0 ? "blocked_pending_review" : "unreviewed";
}

export async function createItem(sql: TransactionSql, request: ItemWrite): Promise<ItemEditChange> {
  const { merchantId, input, now } = request;
  if (!(await lockItemReferences(sql, request))) return { kind: "not_found" };
  if (!(await lockNewItemPhoto(sql, request))) return { kind: "photos_unavailable" };

  const [created] = await sql<{ itemId: string }[]>`
    INSERT INTO public.items
      (merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min, photo_id, moderation_status)
    VALUES (${merchantId}, ${input.categoryId}, ${JSON.stringify(input.names)}::jsonb,
      ${JSON.stringify(input.descriptions)}::jsonb, ${input.priceDzd}, ${[...input.tags]}::text[],
      ${input.extraPrepMinutes}, ${input.photoId}, ${screenItemText(input)})
    RETURNING id AS "itemId"
  `;
  if (!created) throw new Error("Menu item insert returned no row.");
  const target = { merchantId, itemId: created.itemId };
  await insertItemGroups(sql, target, input.optionGroupIds);
  const item = await readChangedItem(sql, { ...target, now });
  return { kind: "changed", value: { item } };
}

export async function updateItem(
  sql: TransactionSql,
  request: ItemUpdate,
): Promise<ItemEditChange> {
  const { merchantId, itemId, input, now } = request;
  const names = JSON.stringify(input.names);
  const descriptions = JSON.stringify(input.descriptions);
  const current = await lockEditableItem(sql, request, { names, descriptions });
  if (!current) return { kind: "not_found" };
  if (current.heldTextChanged) return { kind: "moderation_pending" };
  if (!(await lockItemReferences(sql, request))) return { kind: "not_found" };
  if (!(await lockNewItemPhoto(sql, request, current.photoId)))
    return { kind: "photos_unavailable" };

  const photoId = input.removePhoto ? null : (input.photoId ?? current.photoId);
  const textStatus = screenItemText(input);
  await sql`
    UPDATE public.items SET category_id = ${input.categoryId},
      names = ${names}::jsonb, descriptions = ${descriptions}::jsonb, price_dzd = ${input.priceDzd},
      tags = ${[...input.tags]}::text[], prep_extra_min = ${input.extraPrepMinutes},
      photo_id = ${photoId},
      moderation_status = CASE
        WHEN moderation_status IN ('blocked_pending_review', 'rejected') THEN moderation_status
        WHEN names IS DISTINCT FROM ${names}::jsonb OR descriptions IS DISTINCT FROM ${descriptions}::jsonb
          OR moderation_status = 'unreviewed'
        THEN ${textStatus} ELSE moderation_status END
    WHERE merchant_id = ${merchantId} AND id = ${itemId} AND archived_at IS NULL
  `;
  await sql`DELETE FROM public.item_option_groups WHERE merchant_id = ${merchantId} AND item_id = ${itemId}`;
  await insertItemGroups(sql, request, input.optionGroupIds);
  const item = await readChangedItem(sql, { merchantId, itemId, now });
  return { kind: "changed", value: { item } };
}

export async function duplicateItem(
  sql: TransactionSql,
  { merchantId, itemId, now }: ItemRevision,
): Promise<CommandChange<{ readonly item: MenuItem }, "not_found">> {
  const [source] = await sql<ItemText[]>`
    SELECT names, descriptions FROM public.items
    WHERE merchant_id = ${merchantId} AND id = ${itemId} AND archived_at IS NULL
    FOR SHARE
  `;
  if (!source) return { kind: "not_found" };

  const [duplicate] = await sql<{ itemId: string }[]>`
    INSERT INTO public.items
      (merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min, photo_id, moderation_status)
    SELECT merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min, photo_id,
      CASE WHEN moderation_status IN ('blocked_pending_review', 'rejected')
        THEN moderation_status ELSE ${screenItemText(source)} END
    FROM public.items WHERE merchant_id = ${merchantId} AND id = ${itemId} AND archived_at IS NULL
    RETURNING id AS "itemId"
  `;
  if (!duplicate) return { kind: "not_found" };

  await sql`
    INSERT INTO public.item_option_groups (merchant_id, item_id, group_id, sort)
    SELECT merchant_id, ${duplicate.itemId}::uuid, group_id, sort FROM public.item_option_groups
    WHERE merchant_id = ${merchantId} AND item_id = ${itemId}
  `;
  const item = await readChangedItem(sql, { merchantId, itemId: duplicate.itemId, now });
  return { kind: "changed", value: { item } };
}

export async function archiveItem(
  sql: TransactionSql,
  { merchantId, itemId, now }: ItemRevision,
): Promise<CommandChange<{ readonly itemId: string; readonly archivedAt: string }, "not_found">> {
  const archivedAt = now.toISOString();
  const [archived] = await sql<{ id: string }[]>`
    UPDATE public.items SET archived_at = ${archivedAt}::timestamptz
    WHERE merchant_id = ${merchantId} AND id = ${itemId} AND archived_at IS NULL RETURNING id
  `;
  return archived
    ? { kind: "changed", value: { itemId: archived.id, archivedAt } }
    : { kind: "not_found" };
}

export async function setItemAvailability(
  sql: TransactionSql,
  { merchantId, itemId, input, now }: ItemAvailabilityWrite,
): Promise<CommandChange<ItemAvailability, "not_found">> {
  const { availability } = input;
  const [item] = await sql<
    (Omit<ItemAvailability, "soldOutUntil"> & { soldOutUntil: Date | null })[]
  >`
    UPDATE public.items SET is_available = ${availability === "available"},
      sold_out_until = CASE WHEN ${availability}::text = 'end_of_day' THEN
        (date_trunc('day', ${now.toISOString()}::timestamptz AT TIME ZONE 'Africa/Algiers')
          + interval '1 day') AT TIME ZONE 'Africa/Algiers'
      ELSE NULL END
    WHERE merchant_id = ${merchantId} AND id = ${itemId} AND archived_at IS NULL
    RETURNING id AS "itemId", is_available AS "isAvailable", sold_out_until AS "soldOutUntil"
  `.parsers(timestampParsers);
  if (!item) return { kind: "not_found" };
  return {
    kind: "changed",
    value: { ...item, soldOutUntil: item.soldOutUntil?.toISOString() ?? null },
  };
}
