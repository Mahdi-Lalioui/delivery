import type { courierPosition } from "@zaafran/contracts/courier";

export type Position = ReturnType<typeof courierPosition.parse>;
type Window = { now: number; startedAt: number };

// Rounded outward from the onshore Algeria bounding box in the ISCGM Global Map.
const algeria = { south: 18.95, north: 37.15, west: -8.69, east: 12.01 };
const radians = Math.PI / 180;

function distanceMeters(a: Position, b: Position): number {
  const halfLatitude = ((b.latitude - a.latitude) * radians) / 2;
  const halfLongitude = ((b.longitude - a.longitude) * radians) / 2;
  const haversine =
    Math.sin(halfLatitude) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(halfLongitude) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function inDeliveryWindow(point: Position, at: number, { now, startedAt }: Window): boolean {
  return (
    at >= Math.max(now - 120_000, startedAt) &&
    at <= now &&
    point.accuracyM >= 0 &&
    point.accuracyM <= 100 &&
    point.latitude >= algeria.south &&
    point.latitude <= algeria.north &&
    point.longitude >= algeria.west &&
    point.longitude <= algeria.east
  );
}

function follows(last: Position, next: Position, at: number): boolean {
  const elapsed = at - Date.parse(last.capturedAt);
  if (elapsed < 5_000) return false;
  const distance = distanceMeters(last, next);
  return distance >= 20 && (distance / elapsed) * 3600 <= 150;
}

export function acceptedCourierPositions(
  samples: readonly Position[],
  last: Position | undefined,
  window: Window,
): Position[] {
  const accepted: Position[] = [];
  const ordered = samples
    .map((point) => ({ point, at: Date.parse(point.capturedAt) }))
    .sort((a, b) => a.at - b.at);
  for (const { point, at } of ordered) {
    if (!inDeliveryWindow(point, at, window)) continue;
    const previous = accepted.at(-1) ?? last;
    if (!previous || follows(previous, point, at)) accepted.push(point);
  }
  return accepted;
}
