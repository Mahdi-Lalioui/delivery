import { createHash } from "node:crypto";
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
  readonly reviewToken?: string | undefined;
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
  | {
      readonly kind:
        "forbidden" | "not_found" | "invalid_status" | "idempotency_conflict" | "stale_review";
    };

type Identity = MerchantCommand & { readonly actorId: string };

interface Translations {
  readonly ar?: string;
  readonly fr?: string;
  readonly en?: string;
}

interface ReviewText {
  readonly itemId: string;
  readonly names: Translations;
  readonly descriptions: Translations;
}

function countPriorReviews(sql: TransactionSql) {
  return sql`(SELECT count(*)::text FROM public.item_review_receipts AS receipt
    WHERE receipt.item_id = item.id)`;
}

function makeReviewToken({ itemId, names, descriptions }: ReviewText, priorReviews: string) {
  const text = [names, descriptions].map(({ ar, fr, en }) => [ar ?? null, fr ?? null, en ?? null]);
  return createHash("sha256")
    .update(JSON.stringify([itemId, priorReviews, text]))
    .digest("hex");
}

async function lockReviewState(
  sql: TransactionSql,
  { itemId, merchantId }: { itemId: string; merchantId: string },
) {
  const [item] = await sql<(ReviewText & { pending: boolean; priorReviews: string })[]>`
    SELECT item.id AS "itemId", item.names, item.descriptions,
      (item.moderation_status = 'blocked_pending_review' AND item.archived_at IS NULL) AS pending,
      ${countPriorReviews(sql)} AS "priorReviews"
    FROM public.items AS item
    WHERE item.id = ${itemId} AND item.merchant_id = ${merchantId}
    FOR NO KEY UPDATE OF item
  `;
  return item;
}

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
  const { actorId, itemId, decision, reason, now, reviewToken } = request;
  // Menu editors lock the merchant before taking item locks.
  const [merchant] = await sql<{ merchantId: string }[]>`
    SELECT merchant.id AS "merchantId"
    FROM public.items AS item JOIN public.merchants AS merchant ON merchant.id = item.merchant_id
    WHERE item.id = ${itemId}
    FOR NO KEY UPDATE OF merchant
  `;
  if (!merchant) return { kind: "not_found" };

  const { merchantId } = merchant;
  const item = await lockReviewState(sql, { itemId, merchantId });
  if (!item) return { kind: "not_found" };
  if (!item.pending) return { kind: "invalid_status" };
  // A legacy decision can only target the first hold, whose text is immutable while pending.
  const stale =
    reviewToken === undefined
      ? item.priorReviews !== "0"
      : reviewToken !== makeReviewToken(item, item.priorReviews);
  if (stale) return { kind: "stale_review" };

  const status = decision === "approve" ? "approved" : "rejected";
  await sql`
    UPDATE public.items SET moderation_status = ${status}
    WHERE id = ${itemId} AND merchant_id = ${merchantId}
  `;
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
  readonly includeReviewToken?: boolean | undefined;
}

interface HeldItem extends ReviewText {
  readonly merchantId: string;
  readonly restaurantName: string;
  readonly reviewToken?: string;
}

/** Items held by the screen, oldest id first, on `items_held_for_review_idx`. */
async function listHeldItems(
  sql: TransactionSql,
  { adminUserId, cursor, limit, includeReviewToken }: HeldItemPage,
) {
  if (!(await lockMerchantAdmin(sql, adminUserId))) return undefined;
  const reviewCount = includeReviewToken
    ? sql`, ${countPriorReviews(sql)} AS "priorReviews"`
    : sql``;
  const rows = await sql<(HeldItem & { priorReviews?: string })[]>`
    SELECT item.id AS "itemId", item.merchant_id AS "merchantId",
      merchant.restaurant_name AS "restaurantName", item.names, item.descriptions ${reviewCount}
    FROM public.items AS item JOIN public.merchants AS merchant ON merchant.id = item.merchant_id
    WHERE item.moderation_status = 'blocked_pending_review' AND item.archived_at IS NULL
      AND (${cursor ?? null}::uuid IS NULL OR item.id > ${cursor ?? null}::uuid)
    ORDER BY item.id LIMIT ${limit + 1}
  `;
  const items: HeldItem[] = rows
    .slice(0, limit)
    .map(({ priorReviews, ...item }) =>
      priorReviews === undefined
        ? item
        : { ...item, reviewToken: makeReviewToken(item, priorReviews) },
    );
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? last.itemId : null };
}

export function createMenuModerationRepository({ sql }: DatabaseConnection) {
  return {
    listHeldItems: (page: HeldItemPage) => sql.begin((tx) => listHeldItems(tx, page)),
    reviewItem: (request: ReviewItem) => sql.begin((tx) => reviewItem(tx, request)),
  };
}
