import type { TransactionSql } from "postgres";
import { lockMediaSession, lockMediaTarget } from "./media-access.js";
import type { MediaIdentity, MediaScope } from "./media-types.js";

export interface MediaCrop {
  readonly focalX: number;
  readonly focalY: number;
  readonly zoomPercent: number;
}

export interface MediaCropRequest extends MediaScope {
  readonly crop: MediaCrop;
}

export type MediaCropResult<Media> =
  | { readonly kind: "accepted" | "replayed"; readonly media: Media }
  | { readonly kind: "not_found" | "crop_unavailable" | "crop_conflict" };

interface LockedCropTarget {
  readonly kind: MediaIdentity["kind"];
  readonly status: string;
  readonly matchesCrop: boolean;
}

async function lockCropTarget(sql: TransactionSql, request: MediaCropRequest) {
  const { accountId, mediaId, crop } = request;
  const [target] = await sql<{ merchantId: string | null }[]>`
    SELECT merchant_id AS "merchantId" FROM public.media_uploads
    WHERE id = ${mediaId} AND owner_id = ${accountId}
  `;
  if (!target || !(await lockMediaTarget(sql, accountId, target.merchantId))) return undefined;

  // Lock merchant membership before the upload, matching the parent-to-child foreign-key order.
  const [upload] = await sql<LockedCropTarget[]>`
    SELECT kind, status, (crop_focal_x, crop_focal_y, crop_zoom_percent)
      IS NOT DISTINCT FROM (${crop.focalX}::int, ${crop.focalY}::int, ${crop.zoomPercent}::int)
      AS "matchesCrop"
    FROM public.media_uploads
    WHERE id = ${mediaId} AND owner_id = ${accountId}
      AND merchant_id IS NOT DISTINCT FROM ${target.merchantId}::uuid
    FOR UPDATE
  `;
  return upload;
}

/** Records the owner's crop and enqueues publication in the same transaction. */
export async function acceptMediaCrop(
  sql: TransactionSql,
  request: MediaCropRequest,
): Promise<MediaCropResult<MediaIdentity>> {
  const session = await lockMediaSession(sql, request);
  if (!session) return { kind: "not_found" };
  const upload = await lockCropTarget(sql, request);
  if (!upload) return { kind: "not_found" };

  const { mediaId, crop } = request;
  const media = { mediaId, sessionId: session.sessionId, kind: upload.kind };
  if (upload.status === "processing" || upload.status === "ready") {
    return upload.matchesCrop ? { kind: "replayed", media } : { kind: "crop_conflict" };
  }
  if (upload.status !== "awaiting_crop") return { kind: "crop_unavailable" };

  await sql`
    UPDATE public.media_uploads
    SET status = 'processing', crop_focal_x = ${crop.focalX}, crop_focal_y = ${crop.focalY},
      crop_zoom_percent = ${crop.zoomPercent}
    WHERE id = ${mediaId}
  `;
  await sql`
    SELECT graphile_worker.add_job(
      'media.process', json_build_object('mediaId', ${mediaId}::uuid, 'phase', 'publish'),
      queue_name => 'media', job_key => ${`media:publish:${mediaId}`}
    )
  `;
  return { kind: "accepted", media };
}
