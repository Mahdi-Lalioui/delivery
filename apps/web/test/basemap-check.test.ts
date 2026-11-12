import { expect, test } from "vitest";
import { isBasemapDrawn } from "../src/tracking/basemap-check";

test("[CUS-18] a map with streets or buildings counts as drawn", () => {
  expect(isBasemapDrawn([{ sourceLayer: "water" }, { sourceLayer: "roads" }])).toBe(true);
  expect(isBasemapDrawn([{ sourceLayer: "buildings" }])).toBe(true);
});

test("[CUS-18] placeholder, failed or empty tiles keep the designed map", () => {
  expect(isBasemapDrawn([])).toBe(false);
  expect(isBasemapDrawn([{ sourceLayer: "pois" }, { sourceLayer: "water" }, {}])).toBe(false);
});
