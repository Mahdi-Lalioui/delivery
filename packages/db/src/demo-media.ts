import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.ts";

// D-023: the seed-only uploader. It has no session or membership, so it can never sign in to
// anything; the number sits in D-022's fictional demo block.
const demoUploaderPhone = "+213550999900";
// D-023: a centred crop at the natural size, matching the generated 4:3 placeholder.
const centredCrop = { focalX: 5000, focalY: 5000, zoomPercent: 100 } as const;

export interface DemoItem {
  readonly itemId: string;
  readonly merchantId: string;
  readonly names: { readonly ar: string; readonly fr: string };
  readonly cuisine: string;
}

interface DemoUploadInput {
  readonly merchantId: string;
  readonly quarantineKey: string;
  readonly bytes: number;
  readonly digest: Uint8Array;
  readonly now: Date;
}

/** Demo dishes that still need a generated photo, oldest first. */
export async function listDemoItemsWithoutPhoto({ sql }: DatabaseConnection) {
  return sql<DemoItem[]>`
    SELECT item.id AS "itemId", item.merchant_id AS "merchantId", item.names,
      merchant.cuisines[1] AS cuisine
    FROM public.items AS item
    JOIN public.merchants AS merchant ON merchant.id = item.merchant_id
    WHERE merchant.is_demo AND item.photo_media_id IS NULL AND item.archived_at IS NULL
    ORDER BY item.id
  `;
}

async function demoUploaderId(sql: TransactionSql, now: Date): Promise<string> {
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO public.users (phone_e164, created_at)
    VALUES (${demoUploaderPhone}, ${now.toISOString()})
    ON CONFLICT (phone_e164) DO UPDATE SET phone_e164 = EXCLUDED.phone_e164
    RETURNING id
  `;
  if (!user) throw new Error("The demo uploader upsert returned no row.");
  return user.id;
}

/** Records a generated original as an adopted item upload, ready for the worker's prepare. */
export async function insertDemoPhotoUpload(
  { sql }: DatabaseConnection,
  input: DemoUploadInput,
): Promise<string> {
  return sql.begin(async (transaction) => {
    const ownerId = await demoUploaderId(transaction, input.now);
    const at = input.now.toISOString();
    const [upload] = await transaction<{ id: string }[]>`
      INSERT INTO public.media_uploads (owner_id, merchant_id, kind, content_type, bytes, status,
        quarantine_key, content_digest, created_at, adopted_at)
      SELECT ${ownerId}, merchant.id, 'item', 'image/png', ${input.bytes}, 'preparing',
        ${input.quarantineKey}, ${input.digest}, ${at}, ${at}
      FROM public.merchants AS merchant
      WHERE merchant.id = ${input.merchantId} AND merchant.is_demo
      RETURNING id
    `;
    if (!upload) throw new Error("Demo photos belong to demo restaurants only.");
    return upload.id;
  });
}

/** Applies the centred crop once the preview exists; false in every other state. */
export async function acceptDemoCrop({ sql }: DatabaseConnection, mediaId: string) {
  const updated = await sql`
    UPDATE public.media_uploads
    SET status = 'processing', crop_focal_x = ${centredCrop.focalX},
      crop_focal_y = ${centredCrop.focalY}, crop_zoom_percent = ${centredCrop.zoomPercent}
    WHERE id = ${mediaId} AND status = 'awaiting_crop'
  `;
  return updated.count === 1;
}

/** Links a published photo to a demo dish that has none; false if anything does not match. */
export async function attachDemoItemPhoto(
  { sql }: DatabaseConnection,
  { itemId, mediaId }: { itemId: string; mediaId: string },
) {
  const updated = await sql`
    UPDATE public.items AS item SET photo_media_id = media.id
    FROM public.media_uploads AS media, public.merchants AS merchant
    WHERE item.id = ${itemId} AND item.photo_media_id IS NULL
      AND merchant.id = item.merchant_id AND merchant.is_demo
      AND media.id = ${mediaId} AND media.merchant_id = item.merchant_id
      AND media.kind = 'item' AND media.status = 'ready'
  `;
  return updated.count === 1;
}
