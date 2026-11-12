import { isValidCoordinates, type Coordinates } from "./coordinates.js";

export type RoadRoute = {
  distanceM: number;
  durationSeconds: number;
  points: Coordinates[] | null;
};
type RouterOptions = { origin?: string | undefined; fetcher?: typeof fetch; now?: () => number };
const radians = Math.PI / 180;

function fallback(from: Coordinates, to: Coordinates): RoadRoute {
  const deltaLat = (to.latitude - from.latitude) * radians;
  const deltaLon = (to.longitude - from.longitude) * radians;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(from.latitude * radians) *
      Math.cos(to.latitude * radians) *
      Math.sin(deltaLon / 2) ** 2;
  const distanceM = Math.ceil(12_742_000 * Math.asin(Math.sqrt(Math.min(1, h))) * 1.35);
  // A conservative 24 km/h estimate when the road graph is unavailable.
  return { distanceM, durationSeconds: Math.ceil(distanceM * 0.15), points: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPair(value: unknown): value is [unknown, unknown] {
  return Array.isArray(value) && value.length === 2;
}

function routePoint(sample: unknown): Coordinates | undefined {
  if (!isPair(sample)) return undefined;
  const [longitude, latitude] = sample;
  if (typeof latitude !== "number" || typeof longitude !== "number") return undefined;
  const coordinates = { latitude, longitude };
  return isValidCoordinates(coordinates) ? coordinates : undefined;
}

function readPoints(geometry: unknown): Coordinates[] | null {
  if (!isRecord(geometry) || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates))
    return null;
  if (geometry.coordinates.length < 2 || geometry.coordinates.length > 5_000) return null;
  const points: Coordinates[] = [];
  for (const sample of geometry.coordinates) {
    const point = routePoint(sample);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

function readRoute(payload: unknown): RoadRoute | undefined {
  if (!isRecord(payload)) throw new Error("Invalid OSRM response");
  if (payload.code === "NoRoute" || payload.code === "NoSegment") return undefined;
  const route: unknown = Array.isArray(payload.routes) ? payload.routes[0] : undefined;
  if (payload.code !== "Ok" || !isRecord(route)) throw new Error("Invalid OSRM route");
  const { distance, duration, geometry } = route;
  if (!isNonNegative(distance) || !isNonNegative(duration))
    throw new Error("Invalid OSRM measurements");
  return {
    distanceM: Math.ceil(distance),
    durationSeconds: Math.ceil(duration),
    points: readPoints(geometry),
  };
}

function pair({ longitude, latitude }: Coordinates) {
  return String(longitude) + "," + String(latitude);
}

async function requestRoute(
  from: Coordinates,
  to: Coordinates,
  { origin, fetcher }: { origin: string; fetcher: typeof fetch },
) {
  const url = new URL("/route/v1/driving/" + pair(from) + ";" + pair(to), origin);
  url.search = "overview=simplified&geometries=geojson";
  const response = await fetcher(url, { signal: AbortSignal.timeout(750), redirect: "error" });
  if (response.status >= 500) throw new Error("OSRM is unavailable");
  const payload: unknown = await response.json();
  return readRoute(payload);
}

export function createRoadRouter({ origin, fetcher = fetch, now = Date.now }: RouterOptions = {}) {
  let failures = 0;
  let resumeAt = 0;
  let probing = false;
  const unavailable = () => resumeAt > now() || probing;

  return async (from: Coordinates, to: Coordinates): Promise<RoadRoute> => {
    if (!isValidCoordinates(from) || !isValidCoordinates(to))
      throw new RangeError("Invalid route coordinates");
    if (!origin || unavailable()) return fallback(from, to);
    const probe = resumeAt !== 0;
    if (probe) probing = true;
    try {
      const route = await requestRoute(from, to, { origin, fetcher });
      failures = 0;
      resumeAt = 0;
      return route ?? fallback(from, to);
    } catch {
      failures += 1;
      if (failures >= 3) resumeAt = now() + 60_000;
      return fallback(from, to);
    } finally {
      if (probe) probing = false;
    }
  };
}
