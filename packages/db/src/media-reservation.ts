import type { TransactionSql } from "postgres";
import { lockCourierDelivery } from "./courier-delivery-scope.js";
import { queueDeliveryProofRetention } from "./delivery-proof-retention.js";
import { lockMediaSession, lockMediaTarget } from "./media-access.js";
import type { MediaKind, MediaReservationRequest, MediaReservationResult } from "./media-types.js";

async function reservationTarget(
  sql: TransactionSql,
  { input, accountId, sessionId }: MediaReservationRequest,
) {
  if (input.kind === "delivery_proof") {
    const delivery = await lockCourierDelivery(sql, {
      userId: accountId,
      sessionId,
      orderId: input.orderId,
    });
    return delivery && { merchantId: delivery.merchantId, orderId: input.orderId };
  }
  const merchantId = input.kind === "application" ? null : input.merchantId;
  if (!(await lockMediaTarget(sql, accountId, merchantId))) return undefined;
  return { merchantId, orderId: null };
}

async function hasProofQuota(sql: TransactionSql, orderId: string) {
  const [exhausted] = await sql`
    SELECT FROM public.media_uploads WHERE delivery_order_id = ${orderId} AND kind = 'delivery_proof'
    LIMIT 1 OFFSET 4
  `;
  return !exhausted;
}

export async function reserveMedia(
  sql: TransactionSql,
  request: MediaReservationRequest,
): Promise<MediaReservationResult> {
  const session = await lockMediaSession(sql, request);
  if (!session) return { kind: "not_found" };

  const { input, idempotencyKeyHash, requestHash, now } = request;
  const target = await reservationTarget(sql, request);
  if (!target) return { kind: "not_found" };
  const { merchantId, orderId } = target;

  const lockKey = `${session.accountId}:reserve:${Buffer.from(idempotencyKeyHash).toString("hex")}`;
  await sql`SELECT pg_advisory_xact_lock(492215, hashtext(${lockKey}))`;
  const [receipt] = await sql<{ mediaId: string; kind: MediaKind; matches: boolean }[]>`
    SELECT upload.id AS "mediaId", upload.kind, receipt.request_hash = ${requestHash} AS matches
    FROM public.media_command_receipts AS receipt
    JOIN public.media_uploads AS upload ON upload.id = receipt.media_id
    WHERE receipt.actor_id = ${session.accountId} AND receipt.operation = 'reserve'
      AND receipt.key_hash = ${idempotencyKeyHash}
  `;
  const status = "awaiting_upload";
  if (receipt) {
    if (!receipt.matches) return { kind: "idempotency_conflict" };
    const { mediaId, kind } = receipt;
    return { kind: "replayed", media: { mediaId, sessionId: session.sessionId, kind, status } };
  }

  if (orderId && !(await hasProofQuota(sql, orderId))) return { kind: "proof_photo_limit" };
  const [upload] = await sql<{ id: string }[]>`
    INSERT INTO public.media_uploads
      (owner_id, reservation_session_id, merchant_id, delivery_order_id, kind, content_type, bytes, created_at)
    VALUES (${session.accountId}, ${session.sessionId}, ${merchantId}, ${orderId}, ${input.kind},
      ${input.contentType}, ${input.bytes}, ${now.toISOString()})
    RETURNING id
  `;
  if (!upload) throw new Error("Media reservation insert returned no row.");
  if (orderId) await queueDeliveryProofRetention(sql, upload.id, now);

  await sql`
    INSERT INTO public.media_command_receipts
      (actor_id, operation, key_hash, request_hash, media_id, recorded_at)
    VALUES (${session.accountId}, 'reserve', ${idempotencyKeyHash}, ${requestHash}, ${upload.id},
      ${now.toISOString()})
  `;
  return {
    kind: "created",
    media: { mediaId: upload.id, sessionId: session.sessionId, kind: input.kind, status },
  };
}
