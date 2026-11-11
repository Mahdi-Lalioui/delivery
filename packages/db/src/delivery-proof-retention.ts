import type { ISql, TransactionSql } from "postgres";

export async function queueDeliveryProofRetention(
  sql: TransactionSql,
  mediaId: string,
  createdAt: Date,
) {
  await sql`
    SELECT graphile_worker.add_job(
      'privacy.purge_delivery_proof', json_build_object('mediaId', ${mediaId}::uuid),
      queue_name => 'media', job_key => ${"privacy:purge-delivery-proof:" + mediaId},
      run_at => ${createdAt.toISOString()}::timestamptz + interval '30 days'
    )
  `;
}

export async function queueDeliveryProofErasure(sql: TransactionSql, userId: string, now: Date) {
  const proofs = await sql<{ id: string }[]>`
    SELECT upload.id FROM public.media_uploads AS upload
    JOIN public.orders AS delivery ON delivery.id = upload.delivery_order_id
    WHERE upload.kind = 'delivery_proof' AND (delivery.customer_id = ${userId} OR upload.owner_id = ${userId})
  `;
  if (!proofs.length) return;
  await sql`
    SELECT graphile_worker.add_job(
      'privacy.purge_delivery_proof', json_build_object('mediaId', proof.id),
      queue_name => 'media', job_key => 'privacy:purge-delivery-proof:' || proof.id::text,
      run_at => ${now.toISOString()}::timestamptz
    )
    FROM unnest(${proofs.map(({ id }) => id)}::uuid[]) AS proof(id)
  `;
}

export async function claimDeliveryProofMedia(sql: ISql, mediaId: string) {
  const [upload] = await sql<{ keys: string[] }[]>`
    UPDATE public.media_uploads AS upload SET delivery_proof_purging = true
    WHERE upload.id = ${mediaId} AND upload.kind = 'delivery_proof'
    RETURNING ARRAY(
      SELECT key FROM (
        SELECT upload.quarantine_key AS key
        UNION SELECT upload.preview_key
        UNION SELECT variant->>'key'
        FROM jsonb_array_elements(coalesce(upload.ready_variants, '[]'::jsonb)) AS item(variant)
        UNION SELECT key FROM public.application_media_artifacts WHERE media_id = upload.id
      ) AS stored WHERE key IS NOT NULL
    ) AS keys
  `;
  return upload;
}

export async function finishDeliveryProofMedia(sql: TransactionSql, mediaId: string) {
  await sql`
    UPDATE public.order_events AS event
    SET payload = jsonb_set(event.payload, '{proof}', '{"kind":"photo"}')
    FROM public.order_delivery_photo_proofs AS proof
    WHERE proof.photo_id = ${mediaId} AND proof.order_id = event.order_id
      AND event.payload->'proof'->>'photoId' = proof.photo_id::text
  `;
  await sql`DELETE FROM public.media_uploads WHERE id = ${mediaId} AND kind = 'delivery_proof' AND delivery_proof_purging`;
}
