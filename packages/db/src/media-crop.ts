import type { ISql, TransactionSql } from "postgres";
import { lockMediaSession, lockMediaUploadTarget } from "./media-access.js";
import type {
  MediaCropCompletion,
  MediaCropRequest,
  MediaCropResult,
  MediaCropWork,
  MediaKind,
} from "./media-types.js";

export async function submitMediaCrop(
  sql: TransactionSql,
  request: MediaCropRequest,
): Promise<MediaCropResult> {
  const session = await lockMediaSession(sql, request);
  if (!session) return { kind: "not_found" };

  const { mediaId, input, idempotencyKeyHash, requestHash, now } = request;
  const { accountId, sessionId } = session;
  const [target] = await sql<
    { merchantId: string | null; deliveryOrderId: string | null; kind: MediaKind }[]
  >`
    SELECT merchant_id AS "merchantId", delivery_order_id AS "deliveryOrderId", kind
    FROM public.media_uploads
    WHERE id = ${mediaId} AND owner_id = ${accountId} AND NOT delivery_proof_purging AND reservation_session_id = ${sessionId}
  `;
  if (!target || !(await lockMediaUploadTarget(sql, request, target))) {
    return { kind: "not_found" };
  }

  const lockKey = `${accountId}:crop:${Buffer.from(idempotencyKeyHash).toString("hex")}`;
  await sql`SELECT pg_advisory_xact_lock(492215, hashtext(${lockKey}))`;
  const { focalX, focalY, zoomPercent } = input;
  const [receipt] = await sql<{ matches: boolean }[]>`
    SELECT (
      receipt.request_hash = ${requestHash} AND receipt.media_id = ${mediaId}
      AND upload.crop_focal_x = ${focalX} AND upload.crop_focal_y = ${focalY}
      AND upload.crop_zoom_percent = ${zoomPercent}
    ) AS matches
    FROM public.media_command_receipts AS receipt
    JOIN public.media_uploads AS upload ON upload.id = receipt.media_id
    WHERE receipt.actor_id = ${accountId} AND receipt.operation = 'crop'
      AND receipt.key_hash = ${idempotencyKeyHash}
  `;

  const media = { mediaId, sessionId, kind: target.kind, status: "processing" } as const;
  if (receipt) {
    return receipt.matches ? { kind: "replayed", media } : { kind: "idempotency_conflict" };
  }

  const update = await sql`
    UPDATE public.media_uploads
    SET status = 'processing', crop_focal_x = ${focalX}, crop_focal_y = ${focalY},
      crop_zoom_percent = ${zoomPercent}
    WHERE id = ${mediaId} AND owner_id = ${accountId} AND NOT delivery_proof_purging AND reservation_session_id = ${sessionId}
      AND merchant_id IS NOT DISTINCT FROM ${target.merchantId}::uuid
      AND status = 'awaiting_crop'
  `;
  if (update.count !== 1) return { kind: "crop_conflict" };

  await sql`
    INSERT INTO public.media_command_receipts
      (actor_id, operation, key_hash, request_hash, media_id, recorded_at)
    VALUES (${accountId}, 'crop', ${idempotencyKeyHash}, ${requestHash}, ${mediaId},
      ${now.toISOString()})
  `;
  await sql`
    SELECT graphile_worker.add_job(
      'media.process', json_build_object('mediaId', ${mediaId}::uuid, 'phase', 'crop'),
      queue_name => 'media', job_key => ${`media:crop:${mediaId}`}
    )
  `;
  return { kind: "accepted", media };
}

export async function findMediaCropWork(
  sql: ISql,
  mediaId: string,
): Promise<MediaCropWork | undefined> {
  const [work] = await sql<MediaCropWork[]>`
    SELECT status, kind, quarantine_key AS "quarantineKey", preview_key AS "previewKey",
      content_type AS "contentType", bytes, content_digest AS digest,
      json_build_object('focalX', crop_focal_x, 'focalY', crop_focal_y,
        'zoomPercent', crop_zoom_percent) AS crop
    FROM public.media_uploads
    WHERE id = ${mediaId} AND status IN ('processing', 'ready')
  `;
  if (work?.status === "ready") {
    return { status: work.status, quarantineKey: work.quarantineKey, previewKey: work.previewKey };
  }
  return work;
}

export async function completeMediaCrop(
  sql: ISql,
  { mediaId, quarantineKey, result }: MediaCropCompletion,
): Promise<boolean> {
  const update = await sql`
    UPDATE public.media_uploads
    SET status = 'ready', ready_variants = ${JSON.stringify(result.variants)}::jsonb,
      thumbhash = ${result.thumbhash}
    WHERE id = ${mediaId} AND status = 'processing' AND quarantine_key = ${quarantineKey}
  `;
  return update.count === 1;
}
