import type { TransactionSql } from "postgres";
import type { MediaStoredVariant } from "./media-types.js";
import { readVisibleItem } from "./public-restaurant-items.js";

export type RestaurantPhotoQuery = Pick<MediaStoredVariant, "format" | "width"> & {
  readonly merchantId: string;
  readonly itemId: string;
  readonly mediaId: string;
};

export async function readPublicItemPhoto(sql: TransactionSql, query: RestaurantPhotoQuery) {
  const { merchantId, itemId, mediaId, format, width } = query;
  const [photo] = await sql<{ readonly variants: readonly MediaStoredVariant[] }[]>`
    SELECT upload.ready_variants AS variants
    FROM public.merchants AS merchant
    JOIN public.items AS item ON item.merchant_id = merchant.id
    JOIN public.media_uploads AS upload
      ON upload.id = item.photo_id AND upload.merchant_id = item.merchant_id
    WHERE merchant.id = ${merchantId} AND merchant.status = 'active' AND NOT merchant.is_demo
      AND item.id = ${itemId} AND item.archived_at IS NULL
      AND upload.id = ${mediaId} AND upload.kind = 'item' AND upload.status = 'ready'
  `;
  if (!photo) return undefined;
  // Visibility is identical to menu/detail reads, including legacy text screening.
  const item = await readVisibleItem(sql, { merchantId, itemId, now: new Date(0) });
  if (!item) return undefined;
  const variant = photo.variants.find((entry) => entry.format === format && entry.width === width);
  return variant && { key: variant.key };
}
