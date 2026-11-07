import { dayMs, getAlgiersDayStart, isCalendarInstant, minuteMs } from "./hours.ts";

type RamadanEndpoint =
  | { readonly kind: "maghrib"; readonly minutes: number }
  | { readonly kind: "clock"; readonly minuteOfDay: number };

function resolveEndpoint(endpoint: RamadanEndpoint, maghribAt: number): number | null {
  if (endpoint.kind === "maghrib") {
    if (!Number.isSafeInteger(endpoint.minutes)) return null;
    return maghribAt + endpoint.minutes * minuteMs;
  }
  const { minuteOfDay } = endpoint;
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 1440) return null;
  return getAlgiersDayStart(maghribAt) + minuteOfDay * minuteMs;
}

export function resolveRamadanRange({
  maghribAt,
  opens,
  closes,
}: {
  readonly maghribAt: number;
  readonly opens: RamadanEndpoint;
  readonly closes: RamadanEndpoint;
}): { opensAt: number; closesAt: number } | null {
  if (!isCalendarInstant(maghribAt)) return null;
  const opensAt = resolveEndpoint(opens, maghribAt);
  let closesAt = resolveEndpoint(closes, maghribAt);
  if (opensAt === null || closesAt === null) return null;
  if (closes.kind === "clock" && closesAt < opensAt) closesAt += dayMs;
  if (!isCalendarInstant(opensAt) || !isCalendarInstant(closesAt) || opensAt >= closesAt)
    return null;
  return { opensAt, closesAt };
}

export function getIftarArrivalAt(deliveryMaghribAt: number): number | null {
  if (!isCalendarInstant(deliveryMaghribAt)) return null;
  const arrivalAt = deliveryMaghribAt - 5 * minuteMs;
  return isCalendarInstant(arrivalAt) ? arrivalAt : null;
}

export function getMaghribCountdownMs({
  now,
  maghribAt,
}: {
  readonly now: number;
  readonly maghribAt: number;
}): number | null {
  if (!isCalendarInstant(now) || !isCalendarInstant(maghribAt)) return null;
  return Math.max(0, maghribAt - now);
}
