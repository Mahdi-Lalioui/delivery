import { fail } from "./result.ts";

type Durations = { readonly prepMinutes: number; readonly travelMinutes: number };
type TrackingClock = { readonly now: number; readonly lastComputedAt: number | null };

const roundToFive = (minutes: number) => Math.round(minutes / 5) * 5;

function isDuration(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes >= 0;
}

export function estimateDelivery({ prepMinutes, travelMinutes }: Durations) {
  const eta = prepMinutes + travelMinutes + 3;
  if (!isDuration(prepMinutes) || !isDuration(travelMinutes) || eta + 10 > Number.MAX_SAFE_INTEGER)
    return fail("invalid_eta");
  return {
    ok: true as const,
    value: { earliestMinutes: roundToFive(eta - 3), latestMinutes: roundToFive(eta + 5) },
  };
}

function isTimestamp(at: number): boolean {
  return Number.isSafeInteger(at) && at >= 0;
}

export function isTrackingEtaDue({ now, lastComputedAt }: TrackingClock): boolean {
  if (!isTimestamp(now)) return false;
  return lastComputedAt === null || (isTimestamp(lastComputedAt) && now - lastComputedAt >= 30_000);
}
