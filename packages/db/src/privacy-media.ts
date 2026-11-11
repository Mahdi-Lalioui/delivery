import type { ISql, TransactionSql } from "postgres";

function erasureMediaScope(sql: ISql, userId: string) {
  return sql`
    upload.owner_id = ${userId} AND upload.kind = 'application'
    AND EXISTS (SELECT FROM public.users WHERE id = upload.owner_id AND deleted_at IS NOT NULL)
    AND NOT EXISTS (
      SELECT FROM public.merchant_application_photos AS attachment WHERE attachment.media_id = upload.id
    )
  `;
}

export async function queueErasureMedia(sql: TransactionSql, userId: string): Promise<void> {
  const [orphan] = await sql`
    SELECT FROM public.media_uploads AS upload WHERE ${erasureMediaScope(sql, userId)} LIMIT 1
  `;
  if (!orphan) return;
  await sql`
    SELECT graphile_worker.add_job(
      'privacy.purge_media', json_build_object('userId', ${userId}::uuid),
      queue_name => 'media', job_key => ${`privacy:purge-media:${userId}`}
    )
  `;
}

export async function findErasureMedia(sql: ISql, userId: string) {
  const rows = await sql<{ mediaId: string; keys: string[] }[]>`
    SELECT upload.id AS "mediaId",
      ARRAY(
        SELECT key FROM (
          SELECT upload.quarantine_key AS key
          UNION SELECT upload.preview_key
          UNION SELECT variant->>'key'
          FROM jsonb_array_elements(coalesce(upload.ready_variants, '[]'::jsonb)) AS item(variant)
          UNION SELECT key FROM public.application_media_artifacts WHERE media_id = upload.id
        ) AS stored WHERE key IS NOT NULL
      ) AS keys
    FROM public.media_uploads AS upload
    WHERE ${erasureMediaScope(sql, userId)} ORDER BY upload.id LIMIT 20
  `;
  return [...rows];
}

export async function finishErasureMedia(
  sql: ISql,
  { userId, mediaId }: { readonly userId: string; readonly mediaId: string },
): Promise<void> {
  await sql`
    DELETE FROM public.media_uploads AS upload
    WHERE upload.id = ${mediaId} AND ${erasureMediaScope(sql, userId)}
  `;
}

export async function recordApplicationMediaArtifact(
  sql: ISql,
  mediaId: string,
  key: string,
): Promise<void> {
  await sql`
    INSERT INTO public.application_media_artifacts (media_id, key)
    SELECT id, ${key} FROM public.media_uploads WHERE id = ${mediaId} AND kind = 'application'
    ON CONFLICT (media_id, key) DO NOTHING
  `;
}
