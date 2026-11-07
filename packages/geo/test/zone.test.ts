import { expect, test } from "vitest";
import { coversDeliveryZone } from "../src/zone.ts";

function at(longitude: number, latitude: number) {
  return { latitude, longitude };
}

const exterior = [at(3, 36), at(4, 36), at(4, 37), at(3, 37)];
const hole = [at(3.25, 36.25), at(3.75, 36.25), at(3.75, 36.75), at(3.25, 36.75)];
const polygon = { exterior, holes: [hole] };

test.each([
  { point: at(3.125, 36.5), covered: true },
  { point: at(3, 36), covered: true },
  { point: at(3.5, 36), covered: true },
  { point: at(4, 36.5), covered: true },
  { point: at(3.5, 36.5), covered: false },
  { point: at(3.5, 36.25), covered: true },
  { point: at(3.75, 36.75), covered: true },
  { point: at(3.5, 36.250_000_001), covered: false },
  { point: at(4.000_000_001, 36.5), covered: false },
  { point: at(4.5, 37), covered: false },
])("[GEO-03:domain] classifies a point at an exterior or hole: %j", ({ point, covered }) => {
  expect(coversDeliveryZone({ point, polygon })).toBe(covered);
});

test("[GEO-03:domain] accepts explicit ring closure and either winding order", () => {
  const oppositeWinding = [at(3, 36), at(3, 37), at(4, 37), at(4, 36), at(3, 36)];
  const oppositeHole = [at(3.25, 36.25), at(3.25, 36.75), at(3.75, 36.75), at(3.75, 36.25)];
  const closedPolygon = { exterior: oppositeWinding, holes: [oppositeHole] };
  expect(coversDeliveryZone({ point: at(3.125, 36.5), polygon: closedPolygon })).toBe(true);
  expect(coversDeliveryZone({ point: at(3.5, 36.5), polygon: closedPolygon })).toBe(false);
});

test("[GEO-03:domain] classifies a diagonal boundary and either side of a concave notch", () => {
  const exterior = [at(3, 36), at(4, 36), at(4, 37), at(3.5, 36.5), at(3, 37)];
  expect(coversDeliveryZone({ point: at(3.75, 36.75), polygon: { exterior } })).toBe(true);
  expect(coversDeliveryZone({ point: at(3.75, 36.74), polygon: { exterior } })).toBe(true);
  expect(coversDeliveryZone({ point: at(3.75, 36.76), polygon: { exterior } })).toBe(false);
});

test.each([at(3, 91), at(181, 36), at(Number.NaN, 36)])(
  "[GEO-03:domain] rejects an invalid query point %j",
  (point) => {
    expect(coversDeliveryZone({ point, polygon })).toBe(false);
  },
);

test.each([
  { exterior: [] },
  { exterior: [at(3, 36), at(4, 36)] },
  { exterior, holes: [[at(3.25, 36.25), at(3.75, 36.25)]] },
  { exterior: [at(3, 36), at(4, 36), at(4, 37), at(3, Number.POSITIVE_INFINITY)] },
])("[GEO-03:domain] rejects malformed ring coordinates %j", (polygon) => {
  expect(coversDeliveryZone({ point: at(3.125, 36.5), polygon })).toBe(false);
});
