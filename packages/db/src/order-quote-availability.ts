import { dayMs, isOpenAt, type BusinessHours } from "@zaafran/domain/hours";
import { getHoursPreview } from "@zaafran/domain/hours-preview";
import type { addressOutput } from "@zaafran/contracts/addresses";
import type { TransactionSql } from "postgres";
import { addressProjection } from "./addresses.js";
import { readFeedHours } from "./public-feed-hours.js";
import { timestampParsers } from "./timestamp-parsers.js";

type Timing = { kind: "asap" } | { kind: "scheduled"; scheduledFor: string };
type Merchant = {
  merchantId: string;
  restaurantName: string;
  pausedUntil: Date | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  prepMinutes: number;
  pickupMinimumDzd: number;
};

export async function readOrderMerchant(sql: TransactionSql, merchantId: string) {
  const [merchant] = await sql<Merchant[]>`
    SELECT merchant.id AS "merchantId", merchant.restaurant_name AS "restaurantName", merchant.hours_paused_until AS "pausedUntil",
      settings.pickup_enabled AS "pickupEnabled", settings.delivery_enabled AS "deliveryEnabled",
      settings.prep_minutes AS "prepMinutes", settings.pickup_minimum_dzd AS "pickupMinimumDzd"
    FROM public.merchants AS merchant
    JOIN public.merchant_order_settings AS settings ON settings.merchant_id = merchant.id
    WHERE merchant.id = ${merchantId} AND merchant.status = 'active' AND NOT merchant.is_demo
      AND EXISTS (
        SELECT FROM public.service_areas AS area
        WHERE area.active AND ST_Covers(area.polygon, merchant.location)
          AND NOT EXISTS (
            SELECT FROM public.feature_flags AS flag
            WHERE flag.key = 'ordering:' || area.id::text AND NOT flag.is_enabled
          )
      )
  `.parsers(timestampParsers);
  return merchant;
}

type ZonePricing = { feeDzd: number; minimumDzd: number; travelMinutes: number };
type DeliveryTarget = { merchantId: string; customerId: string; addressId: string };

export async function readDeliveryZone(sql: TransactionSql, target: DeliveryTarget) {
  const [address] = await sql<
    {
      zone: ZonePricing | null;
      snapshot: Omit<ReturnType<typeof addressOutput.parse>, "isDefault">;
    }[]
  >`
    SELECT (
      SELECT jsonb_build_object(
        'feeDzd', zone.fee_dzd, 'minimumDzd', zone.minimum_dzd, 'travelMinutes', zone.travel_minutes
      )
      FROM public.delivery_zones AS zone
      JOIN public.merchants AS merchant ON merchant.id = zone.merchant_id
      WHERE zone.merchant_id = ${target.merchantId} AND zone.active
        AND CASE WHEN zone.radius_m IS NULL THEN ST_Covers(zone.polygon, address.location)
          ELSE ST_DWithin(merchant.location, address.location, zone.radius_m)
        END
      ORDER BY zone.priority DESC, zone.id LIMIT 1
    ) AS zone, ${addressProjection(sql)} - 'isDefault' AS snapshot
    FROM public.addresses AS address
    WHERE address.user_id = ${target.customerId} AND address.id = ${target.addressId}
      AND EXISTS (
        SELECT FROM public.service_areas AS area
        WHERE area.active AND ST_Covers(area.polygon, address.location)
          AND NOT EXISTS (
            SELECT FROM public.feature_flags AS flag
            WHERE flag.key = 'ordering:' || area.id::text AND NOT flag.is_enabled
          )
      )
  `;
  return address;
}

type SlotRequest = { merchant: Merchant; timing: Timing; now: Date; travelMinutes: number };

function isBookableSlot(hours: BusinessHours, at: number, start: number) {
  return getHoursPreview({ hours, from: start - dayMs }).some(({ intervals }) =>
    intervals.some(({ opensAt, closesAt }) => opensAt <= start && at < closesAt),
  );
}

async function readOrderHours(
  sql: TransactionSql,
  merchant: Merchant,
  now: number,
): Promise<BusinessHours> {
  const { weekly, special } = await readFeedHours(sql, [merchant.merchantId], now);
  return {
    weekly: weekly.get(merchant.merchantId) ?? {},
    special: special.get(merchant.merchantId) ?? {},
    pausedUntil: merchant.pausedUntil?.getTime() ?? 0,
  };
}

export async function resolveQuoteSlot(
  sql: TransactionSql,
  { merchant, timing, now, travelMinutes }: SlotRequest,
) {
  const current = now.getTime();
  const hours = await readOrderHours(sql, merchant, current);
  if (timing.kind === "asap") {
    return isOpenAt({ hours, at: current })
      ? ({ kind: "available", at: now } as const)
      : ({ kind: "restaurant_closed" } as const);
  }
  const at = Date.parse(timing.scheduledFor);
  const start = at - (merchant.prepMinutes + travelMinutes) * 60_000;
  if (
    at % 900_000 !== 0 ||
    start < current ||
    at > current + 3 * dayMs ||
    !isBookableSlot(hours, at, start)
  )
    return { kind: "invalid_slot" } as const;
  return { kind: "available", at: new Date(at) } as const;
}
