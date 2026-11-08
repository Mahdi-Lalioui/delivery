import type { publicRestaurantOutput } from "@zaafran/contracts/restaurant";
import type { TransactionSql } from "postgres";
import type { z } from "zod";
import { getFeedAvailability, readFeedHours } from "./public-feed-hours.js";
import { timestampParsers } from "./timestamp-parsers.js";

type RestaurantProfile = z.infer<typeof publicRestaurantOutput>;
type Restaurant = RestaurantProfile["restaurant"];
type RestaurantRow = Omit<Restaurant, "hours" | "isOpen" | "nextOpensAt" | "pausedUntil"> & {
  readonly pausedUntil: Date | null;
  readonly revision: number;
};

export async function readPublicRestaurant(sql: TransactionSql, slug: string) {
  const [restaurant] = await sql<RestaurantRow[]>`
    SELECT merchant.id AS "merchantId", merchant.slug, merchant.restaurant_name AS name,
      merchant.cuisines, merchant.commune_id AS "communeId", cover.id AS "coverMediaId",
      logo.id AS "logoMediaId", merchant.hours_paused_until AS "pausedUntil",
      merchant.menu_revision::double precision AS revision
    FROM public.merchants AS merchant
    LEFT JOIN public.media_uploads AS cover ON cover.id = merchant.cover_photo_id
      AND cover.merchant_id = merchant.id AND cover.kind = 'cover' AND cover.status = 'ready'
    LEFT JOIN public.media_uploads AS logo ON logo.id = merchant.logo_photo_id
      AND logo.merchant_id = merchant.id AND logo.kind = 'logo' AND logo.status = 'ready'
    WHERE merchant.slug = ${slug} AND merchant.status = 'active' AND NOT merchant.is_demo
  `.parsers(timestampParsers);
  return restaurant;
}

async function readCategories(sql: TransactionSql, merchantId: string) {
  return sql<RestaurantProfile["categories"]>`
    SELECT id AS "categoryId", names, sort AS position,
      CASE WHEN available_from IS NULL THEN NULL ELSE jsonb_build_object(
        'from', left(available_from::text, 5), 'to', left(available_to::text, 5)) END AS availability
    FROM public.categories WHERE merchant_id = ${merchantId}
    ORDER BY sort, id LIMIT 1000
  `;
}

type ProfileResult =
  ({ readonly kind: "found" } & RestaurantProfile) | { readonly kind: "not_found" };

export async function readPublicProfile(
  sql: TransactionSql,
  { slug, now }: { readonly slug: string; readonly now: Date },
): Promise<ProfileResult> {
  const row = await readPublicRestaurant(sql, slug);
  if (!row) return { kind: "not_found" };
  const { pausedUntil, revision, ...restaurant } = row;
  const hours = await readFeedHours(sql, [restaurant.merchantId], now.getTime());
  const weekly = hours.weekly.get(restaurant.merchantId) ?? {};
  const special = hours.special.get(restaurant.merchantId) ?? {};
  const schedule = { weekly, special, ...(pausedUntil && { pausedUntil: pausedUntil.getTime() }) };
  return {
    kind: "found",
    revision,
    restaurant: {
      ...restaurant,
      ...getFeedAvailability(schedule, now.getTime()),
      pausedUntil: pausedUntil?.toISOString() ?? null,
      hours: {
        weekly: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          ranges: [...(weekly[weekday] ?? [])],
        })),
        specialDates: Object.entries(special).map(([date, ranges]) => ({
          date,
          ranges: [...(ranges ?? [])],
        })),
      },
    },
    categories: await readCategories(sql, restaurant.merchantId),
  };
}
