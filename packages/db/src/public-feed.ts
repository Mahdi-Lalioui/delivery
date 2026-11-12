import type { publicFeedOutput } from "@zaafran/contracts/feed";
import type { ISql, TransactionSql } from "postgres";
import type { z } from "zod";
import type { DatabaseConnection } from "./database.js";
import type { MediaStoredVariant } from "./media-types.js";
import { getFeedAvailability, readFeedHours } from "./public-feed-hours.js";
import { readRestaurantRows, type FeedQuery } from "./public-feed-query.js";

type FeedPage = z.infer<typeof publicFeedOutput>;
type PhotoQuery = Pick<MediaStoredVariant, "format" | "width"> & {
  readonly merchantId: string;
  readonly mediaId: string;
};

async function readPage(sql: TransactionSql, query: FeedQuery): Promise<FeedPage> {
  // Checkout in this sprint supports cash. Payment filters cannot advertise unsupported methods.
  if (query.acceptsBaridiPay === true || query.acceptsTpe === true)
    return { restaurants: [], nextCursor: null };
  const rows = await readRestaurantRows(sql, query);
  const page = rows.slice(0, query.limit);
  const nextCursor = rows.length > query.limit ? (page.at(-1)?.merchantId ?? null) : null;
  if (page.length === 0) return { restaurants: [], nextCursor };

  const now = query.now.getTime();
  const hours = await readFeedHours(
    sql,
    page.map(({ merchantId }) => merchantId),
    now,
  );
  const restaurants = page.map(({ pausedUntil, metrics, ...restaurant }) => {
    const weekly = hours.weekly.get(restaurant.merchantId) ?? {};
    const special = hours.special.get(restaurant.merchantId) ?? {};
    const schedule =
      pausedUntil === null
        ? { weekly, special }
        : {
            weekly,
            special,
            pausedUntil: pausedUntil.getTime(),
          };
    return { ...restaurant, ...metrics, ...getFeedAvailability(schedule, now) };
  });
  return { restaurants, nextCursor };
}

async function readPhoto(sql: ISql, { merchantId, mediaId, format, width }: PhotoQuery) {
  const [row] = await sql<{ readonly variants: readonly MediaStoredVariant[] }[]>`
    SELECT upload.ready_variants AS variants
    FROM public.merchants AS merchant
    JOIN public.media_uploads AS upload ON upload.merchant_id = merchant.id
    WHERE merchant.id = ${merchantId} AND merchant.status = 'active' AND NOT merchant.is_demo
      AND upload.id = ${mediaId} AND upload.status = 'ready'
      AND ((upload.kind = 'cover' AND upload.id = merchant.cover_photo_id)
        OR (upload.kind = 'logo' AND upload.id = merchant.logo_photo_id))
  `;
  const variant = row?.variants.find((entry) => entry.format === format && entry.width === width);
  return variant && { key: variant.key };
}

export function createPublicFeedRepository({ sql }: DatabaseConnection) {
  return {
    list: (query: FeedQuery) =>
      sql.begin("isolation level repeatable read read only", (tx) => readPage(tx, query)),
    readPhoto: (query: PhotoQuery) => readPhoto(sql, query),
  };
}
