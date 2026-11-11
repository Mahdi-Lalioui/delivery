import type { TransactionSql } from "postgres";
import { lockMediaSession, lockMediaTarget, mediaStatus } from "./media-access.js";
import type {
  MediaAdoptionRequest,
  MediaAdoptionResult,
  MediaState,
  MediaStatus,
  MediaUploadDescriptor,
} from "./media-types.js";

type LockedUpload = Pick<MediaStatus, "mediaId" | "kind"> &
  MediaState &
  MediaUploadDescriptor & { readonly matchesDigest: boolean | null };

async function lockOwnedUpload(
  sql: TransactionSql,
  { accountId, mediaId, digest }: MediaAdoptionRequest,
): Promise<LockedUpload | undefined> {
  const [target] = await sql<{ merchantId: string | null }[]>`
    SELECT merchant_id AS "merchantId" FROM public.media_uploads
    WHERE id = ${mediaId} AND owner_id = ${accountId}
  `;
  if (!target || !(await lockMediaTarget(sql, accountId, target.merchantId))) return undefined;

  // Lock merchant membership before the upload, matching the parent-to-child foreign-key order.
  const [upload] = await sql<LockedUpload[]>`
    SELECT id AS "mediaId", kind, status, content_type AS "contentType", bytes,
      preview_width AS width, preview_height AS height, rejection_reason AS reason,
      ready_variants AS variants, thumbhash,
      content_digest = ${digest} AS "matchesDigest"
    FROM public.media_uploads
    WHERE id = ${mediaId} AND owner_id = ${accountId}
      AND merchant_id IS NOT DISTINCT FROM ${target.merchantId}::uuid
    FOR UPDATE
  `;
  return upload;
}

export async function adoptMedia(
  sql: TransactionSql,
  request: MediaAdoptionRequest,
): Promise<MediaAdoptionResult> {
  const session = await lockMediaSession(sql, request);
  if (!session) return { kind: "not_found" };

  const upload = await lockOwnedUpload(sql, request);
  if (!upload) return { kind: "not_found" };
  if (upload.contentType !== request.contentType || upload.bytes !== request.bytes) {
    return { kind: "content_mismatch" };
  }

  const { mediaId, kind, status } = upload;
  if (status !== "awaiting_upload") {
    const media = mediaStatus(upload, session.sessionId);
    return upload.matchesDigest ? { kind: "replayed", media } : { kind: "upload_conflict" };
  }

  await sql`
    UPDATE public.media_uploads
    SET status = 'preparing', quarantine_key = ${request.quarantineKey},
      content_digest = ${request.digest}, adopted_at = ${request.now.toISOString()}
    WHERE id = ${mediaId}
  `;
  await sql`
    SELECT graphile_worker.add_job(
      'media.process', json_build_object('mediaId', ${mediaId}::uuid, 'phase', 'prepare'),
      queue_name => 'media', job_key => ${`media:prepare:${mediaId}`}
    )
  `;
  return {
    kind: "accepted",
    media: { mediaId, sessionId: session.sessionId, kind, status: "preparing" },
  };
}
