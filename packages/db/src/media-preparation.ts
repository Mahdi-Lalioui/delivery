import type { ISql } from "postgres";
import type { MediaPreparationCompletion, MediaPreparationSource } from "./media-types.js";

export async function findMediaPreparation(
  sql: ISql,
  mediaId: string,
): Promise<MediaPreparationSource | undefined> {
  const [source] = await sql<MediaPreparationSource[]>`
    SELECT status, quarantine_key AS "quarantineKey", content_type AS "contentType", bytes,
      content_digest AS digest
    FROM public.media_uploads
    WHERE id = ${mediaId} AND status IN ('preparing', 'rejected')
  `;
  if (source?.status === "rejected") {
    return { status: source.status, quarantineKey: source.quarantineKey };
  }
  return source;
}

export async function completeMediaPreparation(
  sql: ISql,
  { mediaId, quarantineKey, result }: MediaPreparationCompletion,
): Promise<boolean> {
  const preview = result.status === "awaiting_crop" ? result : undefined;
  const reason = result.status === "rejected" ? result.reason : null;
  const update = await sql`
    UPDATE public.media_uploads
    SET status = ${result.status}, preview_key = ${preview?.previewKey ?? null},
      preview_width = ${preview?.width ?? null}, preview_height = ${preview?.height ?? null},
      rejection_reason = ${reason}
    WHERE id = ${mediaId} AND status = 'preparing' AND quarantine_key = ${quarantineKey}
  `;
  return update.count === 1;
}
