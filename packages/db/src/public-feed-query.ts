import type { publicFeedQuery, publicRestaurantCard } from "@zaafran/contracts/feed";
import type { TransactionSql } from "postgres";
import { timestampParsers } from "./timestamp-parsers.js";

export type FeedQuery = ReturnType<typeof publicFeedQuery.parse> & { now: Date };
type Card = ReturnType<typeof publicRestaurantCard.parse>;
type MetricKeys =
  | "rating"
  | "ratingCount"
  | "etaMinutes"
  | "deliveryFeeDzd"
  | "distanceMeters"
  | "isNew"
  | "offer"
  | "offersPickup"
  | "pin"
  | "minimumOrderDzd"
  | "priceLevel";
type RestaurantRow = Omit<Card, "isOpen" | "nextOpensAt" | MetricKeys> & {
  pausedUntil: Date | null;
  metrics: Pick<Card, MetricKeys>;
};

function orderBy(sql: TransactionSql, sort: FeedQuery["sort"]) {
  switch (sort) {
    case "distance":
      return sql`distance ASC NULLS LAST, id`;
    case "rating":
      return sql`rating DESC NULLS LAST, rating_count DESC, id`;
    case "eta":
      return sql`eta_max ASC NULLS LAST, id`;
    case "fee":
      return sql`fee_dzd ASC NULLS LAST, id`;
    default:
      return sql`id`;
  }
}

function selectCandidates(
  sql: TransactionSql,
  query: FeedQuery,
  scope: { vegetarianMerchantIds: string[] | null; offers: string },
) {
  const { vegetarianMerchantIds, offers } = scope;
  const now = query.now.toISOString();
  const commune = query.communeId ?? null;
  const cuisine = query.cuisine ?? null;
  const open = query.openNow ?? null;
  const fulfilment = query.fulfilment ?? null;
  const availableAt = query.availableAt ?? null;
  const after = query.sort && query.sort !== "relevance" ? null : (query.cursor ?? null);
  return sql`
    SELECT merchant.id, merchant.slug, merchant.restaurant_name, merchant.cuisines, merchant.commune_id,
      merchant.cover_photo_id, merchant.logo_photo_id, merchant.hours_paused_until, settings.price_level,
      stats.rating, stats.rating_count, zone.fee_dzd, promotion.badge AS offer,
      merchant.first_published_at BETWEEN ${now}::timestamptz - interval '720 hours'
        AND ${now}::timestamptz AS is_new,
      CASE WHEN ${fulfilment}::text = 'pickup' THEN settings.pickup_minimum_dzd
        ELSE zone.minimum_dzd END AS minimum_dzd,
      CASE WHEN settings.pickup_enabled THEN jsonb_build_object(
        'latitude', ST_Y(merchant.location::geometry),
        'longitude', ST_X(merchant.location::geometry)) END AS pickup_pin,
      CASE WHEN zone.travel_minutes IS NOT NULL THEN
        (round((settings.prep_minutes + zone.travel_minutes)::numeric / 5) * 5)::int END AS eta_min,
      CASE WHEN zone.travel_minutes IS NOT NULL THEN
        (round((settings.prep_minutes + zone.travel_minutes + 8)::numeric / 5) * 5)::int END AS eta_max,
      ST_Distance(merchant.location, reference.centroid) AS distance
    FROM public.merchants AS merchant
    LEFT JOIN public.merchant_order_settings AS settings ON settings.merchant_id = merchant.id
    LEFT JOIN public.communes AS reference ON reference.id = ${commune}::uuid
    LEFT JOIN LATERAL (
      SELECT round(avg(rating.food_stars), 1)::float8 AS rating, count(*)::int AS rating_count
      FROM public.orders AS orders JOIN public.ratings AS rating ON rating.order_id = orders.id
      WHERE orders.merchant_id = merchant.id AND orders.status IN ('delivered', 'collected')
    ) AS stats ON true
    LEFT JOIN LATERAL (
      SELECT zone.fee_dzd, zone.minimum_dzd, zone.travel_minutes
      FROM public.delivery_zones AS zone
      WHERE ${fulfilment}::text IS DISTINCT FROM 'pickup'
        AND settings.delivery_enabled AND zone.merchant_id = merchant.id AND zone.active
        AND (${commune}::uuid IS NULL OR (reference.id IS NOT NULL AND CASE WHEN zone.radius_m IS NULL
          THEN ST_Covers(zone.polygon, reference.centroid)
          ELSE ST_DWithin(merchant.location, reference.centroid, zone.radius_m) END))
      ORDER BY
        CASE WHEN reference.id IS NULL THEN zone.fee_dzd END ASC NULLS LAST,
        zone.priority DESC, zone.id
      LIMIT 1
    ) AS zone ON true
    LEFT JOIN LATERAL (
      SELECT entry.badge FROM ROWS FROM (jsonb_to_recordset(${offers}::jsonb) AS (merchant_id uuid, badge jsonb))
        WITH ORDINALITY AS entry(merchant_id, badge, ordinality)
      WHERE entry.merchant_id = merchant.id
        AND (entry.badge->>'kind' <> 'free_delivery' OR zone.fee_dzd > 0)
      ORDER BY entry.ordinality LIMIT 1
    ) AS promotion ON true
    WHERE merchant.status = 'active' AND NOT merchant.is_demo
      AND (NOT ${query.offers === true}::boolean OR promotion.badge IS NOT NULL)
      AND (${vegetarianMerchantIds}::uuid[] IS NULL OR merchant.id = ANY(${vegetarianMerchantIds}::uuid[]))
      AND (${fulfilment}::text IS DISTINCT FROM 'pickup' OR settings.pickup_enabled)
      AND (${fulfilment}::text IS DISTINCT FROM 'delivery' OR zone.fee_dzd IS NOT NULL)
      AND (${availableAt}::timestamptz IS NULL OR
        public.feed_merchant_open(merchant.id, ${availableAt}::timestamptz, merchant.hours_paused_until))
      AND (${after}::uuid IS NULL OR merchant.id > ${after}::uuid)
      AND (${cuisine}::text IS NULL OR merchant.cuisines @> ARRAY[${cuisine}::text])
      AND (${open}::boolean IS NULL OR public.feed_merchant_open(merchant.id, ${now}, merchant.hours_paused_until) = ${open})
  `;
}

function matchingFilters(sql: TransactionSql, query: FeedQuery) {
  const {
    freeDelivery = null,
    minRating = null,
    maxEtaMinutes = null,
    priceLevel = null,
    maxMinimumOrderDzd = null,
    newOnly = false,
  } = query;
  return sql`
    (${freeDelivery}::boolean IS NULL OR (fee_dzd = 0) = ${freeDelivery})
    AND (${minRating}::numeric IS NULL OR rating >= ${minRating})
    AND (${maxEtaMinutes}::int IS NULL OR eta_max <= ${maxEtaMinutes})
    AND (${priceLevel}::smallint IS NULL OR price_level = ${priceLevel})
    AND (${maxMinimumOrderDzd}::int IS NULL OR minimum_dzd <= ${maxMinimumOrderDzd})
    AND (NOT ${newOnly}::boolean OR is_new)
  `;
}

function filterAndPage(sql: TransactionSql, query: FeedQuery) {
  const { cursor = null } = query;
  const limit = query.limit + 1;
  const order = orderBy(sql, query.sort);
  const filter = matchingFilters(sql, query);
  if (!query.sort || query.sort === "relevance") {
    return sql`SELECT * FROM candidates WHERE ${filter} ORDER BY id LIMIT ${limit}`;
  }
  return sql`
    WITH ranked AS (
      SELECT *, row_number() OVER (ORDER BY ${order}) AS position FROM candidates WHERE ${filter}
    )
    SELECT * FROM ranked
    WHERE ${cursor}::uuid IS NULL OR position > (
      SELECT position FROM ranked WHERE id = ${cursor}::uuid
    )
    ORDER BY position LIMIT ${limit}
  `;
}

export function readRestaurantRows(
  sql: TransactionSql,
  query: FeedQuery,
  scope: { vegetarianMerchantIds: string[] | null; offers: string },
) {
  const order = query.sort && query.sort !== "relevance" ? sql`page.position` : sql`page.id`;
  return sql<RestaurantRow[]>`
    WITH candidates AS (${selectCandidates(sql, query, scope)}), page AS (${filterAndPage(sql, query)})
    SELECT page.id AS "merchantId", page.slug, page.restaurant_name AS name,
      page.cuisines, page.commune_id AS "communeId", cover.id AS "coverMediaId", logo.id AS "logoMediaId",
      page.hours_paused_until AS "pausedUntil",
      jsonb_strip_nulls(jsonb_build_object(
        'rating', page.rating, 'ratingCount', CASE WHEN page.rating IS NOT NULL THEN page.rating_count END,
        'etaMinutes', CASE WHEN page.eta_max IS NOT NULL THEN jsonb_build_object('min', page.eta_min, 'max', page.eta_max) END,
        'deliveryFeeDzd', page.fee_dzd, 'distanceMeters', round(page.distance)::int,
        'minimumOrderDzd', page.minimum_dzd, 'priceLevel', page.price_level,
        'offersPickup', CASE WHEN page.pickup_pin IS NOT NULL THEN true END, 'pin', page.pickup_pin,
        'offer', page.offer,
        'isNew', CASE WHEN ${query.newOnly === true} AND page.is_new THEN true END
      )) AS metrics
    FROM page
    LEFT JOIN public.media_uploads AS cover ON cover.id = page.cover_photo_id
      AND cover.merchant_id = page.id AND cover.kind = 'cover' AND cover.status = 'ready'
    LEFT JOIN public.media_uploads AS logo ON logo.id = page.logo_photo_id
      AND logo.merchant_id = page.id AND logo.kind = 'logo' AND logo.status = 'ready'
    ORDER BY ${order}
  `.parsers(timestampParsers);
}

export async function countRestaurantRows(
  sql: TransactionSql,
  query: FeedQuery,
  scope: { vegetarianMerchantIds: string[] | null; offers: string },
) {
  const candidates = selectCandidates(sql, { ...query, cursor: undefined }, scope);
  const [result] = await sql<{ total: number }[]>`
    WITH candidates AS (${candidates})
    SELECT count(*)::int AS total FROM candidates WHERE ${matchingFilters(sql, query)}
  `;
  return result?.total ?? 0;
}
