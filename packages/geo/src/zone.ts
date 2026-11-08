import { isValidCoordinates } from "./coordinates.ts";
import type { Coordinates } from "./coordinates.ts";

type Ring = readonly Coordinates[];
type Polygon = { readonly exterior: Ring; readonly holes?: readonly Ring[] };

type RingLocation = "interior" | "boundary" | "exterior";

function isBetween(value: number, first: number, second: number): boolean {
  return value >= Math.min(first, second) && value <= Math.max(first, second);
}

function isWithinEdgeBounds(point: Coordinates, start: Coordinates, end: Coordinates): boolean {
  return (
    isBetween(point.longitude, start.longitude, end.longitude) &&
    isBetween(point.latitude, start.latitude, end.latitude)
  );
}

function crossProduct(point: Coordinates, start: Coordinates, end: Coordinates): number {
  return (
    (end.longitude - start.longitude) * (point.latitude - start.latitude) -
    (end.latitude - start.latitude) * (point.longitude - start.longitude)
  );
}

function locateInRing(point: Coordinates, ring: Ring): RingLocation {
  let previous = ring.at(-1);
  if (!previous) return "exterior";

  let isInterior = false;
  for (const current of ring) {
    const cross = crossProduct(point, previous, current);
    if (cross === 0 && isWithinEdgeBounds(point, previous, current)) return "boundary";

    // Count intersections on the ray to the east, with half-open latitude intervals at vertices.
    const straddles = current.latitude > point.latitude !== previous.latitude > point.latitude;
    const crossesToTheEast = cross > 0 === current.latitude > previous.latitude;
    if (straddles && crossesToTheEast) isInterior = !isInterior;
    previous = current;
  }
  return isInterior ? "interior" : "exterior";
}

function hasRingCoordinates(ring: Ring): boolean {
  return ring.length >= 3 && ring.every(isValidCoordinates);
}

/** Planar covers check for valid polygon topology. Rings may be explicitly closed. */
export function coversDeliveryZone({
  point,
  polygon: { exterior, holes = [] },
}: {
  readonly point: Coordinates;
  readonly polygon: Polygon;
}): boolean {
  if (!isValidCoordinates(point) || !hasRingCoordinates(exterior)) return false;
  if (!holes.every(hasRingCoordinates)) return false;

  const location = locateInRing(point, exterior);
  if (location !== "interior") return location === "boundary";
  return holes.every((hole) => locateInRing(point, hole) !== "interior");
}
