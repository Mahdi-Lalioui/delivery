import { courierPosition } from "@zaafran/contracts/courier";

export type Position = ReturnType<typeof courierPosition.parse>;
const radians = Math.PI / 180;

export function courierGpsFix(
  {
    latitude,
    longitude,
    accuracy,
    heading,
  }: Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy" | "heading">,
  timestamp: number,
): Position | undefined {
  const capturedAt = new Date(timestamp);
  if (!Number.isFinite(capturedAt.getTime())) return undefined;
  const input = {
    latitude,
    longitude,
    accuracyM: accuracy,
    capturedAt: capturedAt.toISOString(),
    ...(heading === null || !Number.isFinite(heading) ? {} : { heading }),
  };
  const result = courierPosition.safeParse(input);
  return result.success ? result.data : undefined;
}

export function isNewCourierPosition(
  point: Position | undefined,
  prior: Position | undefined,
): point is Position {
  if (!point) return false;
  if (!prior) return true;
  if (Date.parse(point.capturedAt) - Date.parse(prior.capturedAt) < 5_000) return false;
  const latitude = ((point.latitude + prior.latitude) * radians) / 2;
  const north = (point.latitude - prior.latitude) * radians;
  const east = (point.longitude - prior.longitude) * radians * Math.cos(latitude);
  return Math.hypot(north, east) * 6_371_000 >= 20;
}
