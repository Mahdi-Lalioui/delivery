import type { publicFeedOutput } from "@zaafran/contracts/feed";
import type { ISql, TransactionSql } from "postgres";
import type { z } from "zod";
import type { DatabaseConnection } from "./database.js";
import type { MediaStoredVariant } from "./media-types.js";
import { getFeedAvailability, readFeedHours } from "./public-feed-hours.js";
import { timestampParsers } from "./timestamp-parsers.js";

type FeedPage = z.infer<typeof publicFeedOutput>;
type RestaurantRow = Omit<FeedPage["restaurants"][number], "isOpen" | "nextOpensAt"> & {
  readonly pausedUntil: Date | null;
};

interface FeedQuery {
  readonly limit: number;
  readonly cursor?: string;
  readonly now: Date;
}

type PhotoQuery = Pick<MediaStoredVariant, "format" | "width"> & {
  readonly merchantId: string;
  readonly mediaId: string;
};

async function readRestaurantRows(sql: TransactionSql, { cursor, limit }: FeedQuery) {
  const after = cursor === undefined ? sql`` : sql`AND merchant.id > ${cursor}::uuid`;
  return sql<RestaurantRow[]>`
    SELECT merchant.id AS "merchantId", merchant.slug, merchant.restaurant_name AS name,
      merchant.cuisines, merchant.commune_id AS "communeId", cover.id AS "coverMediaId",
      logo.id AS "logoMediaId", merchant.hours_paused_until AS "pausedUntil"
    FROM public.merchants AS merchant
    LEFT JOIN public.media_uploads AS cover ON cover.id = merchant.cover_photo_id
      AND cover.merchant_id = merchant.id AND cover.kind = 'cover' AND cover.status = 'ready'
    LEFT JOIN public.media_uploads AS logo ON logo.id = merchant.logo_photo_id
      AND logo.merchant_id = merchant.id AND logo.kind = 'logo' AND logo.status = 'ready'
    WHERE merchant.status = 'active' AND NOT merchant.is_demo ${after}
    ORDER BY merchant.id LIMIT ${limit + 1}
  `.parsers(timestampParsers);
}

async function readPage(sql: TransactionSql, query: FeedQuery): Promise<FeedPage> {
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
  const restaurants = page.map(({ pausedUntil, ...restaurant }) => {
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
    return { ...restaurant, ...getFeedAvailability(schedule, now) };
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
