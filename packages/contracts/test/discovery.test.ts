import { expect, test } from "vitest";
import { discoveryLocationInput, discoveryLocationOutput } from "../src/discovery.ts";

const communeId = "01932f18-3150-7c33-8a7a-53acfd343001";
const point = { latitude: 36.76, longitude: 3.05 };

test("[CUS-02:contract] distinguishes a map point from a chosen commune", () => {
  expect(discoveryLocationInput.parse({ kind: "point", ...point })).toEqual({
    kind: "point",
    ...point,
  });
  expect(discoveryLocationInput.parse({ kind: "commune", communeId })).toEqual({
    kind: "commune",
    communeId,
  });
  expect(discoveryLocationInput.safeParse({ kind: "point", ...point, communeId }).success).toBe(
    false,
  );
  expect(discoveryLocationInput.safeParse({ kind: "commune", communeId: "unknown" }).success).toBe(
    false,
  );
});

test("[GEO-01:contract] bounds coordinates and represents an uncovered point", () => {
  for (const coordinates of [
    { ...point, latitude: 91 },
    { ...point, longitude: -181 },
    { ...point, longitude: Infinity },
  ]) {
    expect(discoveryLocationInput.safeParse({ kind: "point", ...coordinates }).success).toBe(false);
  }
  const outside = { ...point, communeId: null, serviceAreaId: null };
  expect(discoveryLocationOutput.parse(outside)).toEqual(outside);
  const knownOutside = { ...outside, communeId };
  expect(discoveryLocationOutput.parse(knownOutside)).toEqual(knownOutside);
  const covered = { ...knownOutside, serviceAreaId: "01932f18-3150-7c33-8a7a-53acfd343002" };
  expect(discoveryLocationOutput.parse(covered)).toEqual(covered);
  expect(discoveryLocationOutput.safeParse({ ...outside, orderingEnabled: true }).success).toBe(
    false,
  );
});
