import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { lockMerchantAdmin } from "./merchant-access.js";
import type { MerchantCommand, MerchantReviewStatus } from "./merchant-receipts.js";
import { timestampParsers } from "./timestamp-parsers.js";

interface ReviewItem extends MerchantCommand {
  readonly adminUserId: string;
  readonly itemId: string;
  readonly decision: "approve" | "reject";
  readonly reason: string;
  readonly now: Date;
}

interface Reviewed {
  readonly itemId: string;
  readonly merchantId: string;
  readonly status: MerchantReviewStatus;
  readonly reviewedAt: Date;
}

type ReviewItemResult =
  | ({ readonly kind: "reviewed" | "replayed" } & Reviewed)
  | { readonly kind: "forbidden" | "not_found" | "invalid_status" | "idempotency_conflict" };

type Identity = MerchantCommand & { readonly actorId: string };

async function lockReceipt(sql: TransactionSql, identity: Identity) {
  const { actorId, idempotencyKeyHash, requestHash } = identity;
  const lockKey = [actorId, "item_review", Buffer.from(idempotencyKeyHash).toString("hex")];
  await sql`SELECT pg_advisory_xact_lock(492214, hashtext(${lockKey.join(":")}))`;
  const [receipt] = await sql<(Reviewed & { requestMatches: boolean })[]>`
    SELECT item_id AS "itemId", merchant_id AS "merchantId", result_status AS status,
      recorded_at AS "reviewedAt", request_hash = ${requestHash} AS "requestMatches"
    FROM public.item_review_receipts WHERE actor_id = ${actorId} AND key_hash = ${idempotencyKeyHash}
  `.parsers(timestampParsers);
  return receipt;
}

async function applyDecision(
  sql: TransactionSql,
  request: ReviewItem & { readonly actorId: string },
): Promise<ReviewItemResult> {
  const { actorId, itemId, decision, reason, now } = request;
  const status = decision === "approve" ? "approved" : "rejected";
  const [item] = await sql<{ merchantId: string }[]>`
    UPDATE public.items SET moderation_status = ${status}
    WHERE id = ${itemId} AND moderation_status = 'blocked_pending_review' AND archived_at IS NULL
    RETURNING merchant_id AS "merchantId"
  `;
  if (!item) {
    const [existing] = await sql`SELECT id FROM public.items WHERE id = ${itemId}`;
    return { kind: existing ? "invalid_status" : "not_found" };
  }
  const { merchantId } = item;
  const at = now.toISOString();
  // A listing change is a menu change, so cached menus and open editors see a new revision.
  await sql`UPDATE public.merchants SET menu_revision = menu_revision + 1 WHERE id = ${merchantId}`;
  await sql`
    INSERT INTO public.audit_log (actor_id, merchant_id, action, reason, created_at)
    VALUES (${actorId}, ${merchantId}, ${"item_" + status}, ${reason}, ${at}::timestamptz)
  `;
  await sql`
    INSERT INTO public.item_review_receipts
      (actor_id, key_hash, request_hash, item_id, merchant_id, result_status, recorded_at)
    VALUES (${actorId}, ${request.idempotencyKeyHash}, ${request.requestHash}, ${itemId},
      ${merchantId}, ${status}, ${at}::timestamptz)
  `;
  return { kind: "reviewed", itemId, merchantId, status, reviewedAt: now };
}

/** ADM-04: approve or reject an item held by the prohibited-goods screen (SPEC §17.3). */
async function reviewItem(sql: TransactionSql, request: ReviewItem): Promise<ReviewItemResult> {
  const actorId = await lockMerchantAdmin(sql, request.adminUserId);
  if (!actorId) return { kind: "forbidden" };
  const receipt = await lockReceipt(sql, { ...request, actorId });
  if (!receipt) return applyDecision(sql, { ...request, actorId });
  const { requestMatches, ...reviewed } = receipt;
  return requestMatches ? { kind: "replayed", ...reviewed } : { kind: "idempotency_conflict" };
}

interface HeldItemPage {
  readonly adminUserId: string;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

interface Translations {
  readonly ar?: string;
  readonly fr?: string;
  readonly en?: string;
}

interface HeldItem {
  readonly itemId: string;
  readonly merchantId: string;
  readonly restaurantName: string;
  readonly names: Translations;
  readonly descriptions: Translations;
}

/** Items held by the screen, oldest id first, on `items_held_for_review_idx`. */
async function listHeldItems(sql: TransactionSql, { adminUserId, cursor, limit }: HeldItemPage) {
  if (!(await lockMerchantAdmin(sql, adminUserId))) return undefined;
  const rows = await sql<HeldItem[]>`
    SELECT item.id AS "itemId", item.merchant_id AS "merchantId",
      merchant.restaurant_name AS "restaurantName", item.names, item.descriptions
    FROM public.items AS item JOIN public.merchants AS merchant ON merchant.id = item.merchant_id
    WHERE item.moderation_status = 'blocked_pending_review' AND item.archived_at IS NULL
      AND (${cursor ?? null}::uuid IS NULL OR item.id > ${cursor ?? null}::uuid)
    ORDER BY item.id LIMIT ${limit + 1}
  `;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? last.itemId : null };
}

export function createMenuModerationRepository({ sql }: DatabaseConnection) {
  return {
    listHeldItems: (page: HeldItemPage) => sql.begin((tx) => listHeldItems(tx, page)),
    reviewItem: (request: ReviewItem) => sql.begin((tx) => reviewItem(tx, request)),
  };
}
