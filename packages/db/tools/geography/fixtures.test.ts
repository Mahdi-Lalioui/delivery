import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { z } from "zod";
import { joinCentroids } from "./generate.ts";

const fixtureDirectory = new URL("../../fixtures/geography/", import.meta.url);
const wilaya = z.object({
  code: z.int().min(1).max(69),
  nameAr: z.string().trim().min(1),
  nameFr: z.string().trim().min(1),
});
const code = z.string().regex(/^\d{4}$/);
const longitude = z.number().min(-9).max(13);
const latitude = z.number().min(18).max(38);
const point = z.tuple([longitude, latitude]);
const commune = wilaya.extend({
  code,
  wilayaCode: wilaya.shape.code,
  centroid: z.object({
    longitude,
    latitude,
  }),
});
const boundary = z.object({
  type: z.literal("Feature"),
  properties: z.object({ code }),
  geometry: z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(point).min(4)).min(1)).min(1),
  }),
});

function readFixture(name: string): unknown {
  const path = new URL(name, fixtureDirectory);
  const bytes = readFileSync(path);
  const content = name.endsWith(".gz") ? gunzipSync(bytes) : bytes;
  return JSON.parse(content.toString("utf8"));
}

test("[SPEC §12] ships 69 wilayas and 1,541 distinct communes with finite centroids", () => {
  const wilayas = z.array(wilaya).parse(readFixture("wilayas.json"));
  const communes = z.array(commune).parse(readFixture("communes.json"));
  const codes = wilayas.map(({ code: value }) => value);
  expect(codes).toEqual(Array.from({ length: 69 }, (_, index) => index + 1));
  expect(communes).toHaveLength(1_541);
  expect(new Set(communes.map(({ code: value }) => value)).size).toBe(1_541);
  expect(new Set(communes.map(({ wilayaCode }) => wilayaCode))).toEqual(new Set(codes));
});

test("[MER-01:geography] pairs every Algiers commune with a closed official-label boundary", () => {
  const communes = z.array(commune).parse(readFixture("communes.json"));
  const official = z
    .array(z.object({ code_commune: z.int(), name_ar: z.string(), name_fr: z.string() }))
    .parse(
      JSON.parse(readFileSync(new URL("./algiers-official-labels.json", import.meta.url), "utf8")),
    );
  const { features } = z
    .object({ type: z.literal("FeatureCollection"), features: z.array(boundary) })
    .parse(readFixture("algiers-boundaries.geojson.gz"));
  const algiers = communes.filter(({ wilayaCode }) => wilayaCode === 16);
  expect(algiers).toHaveLength(57);
  expect(features.map(({ properties }) => properties.code)).toEqual(
    algiers.map(({ code: value }) => value),
  );
  expect(
    algiers.map(({ code: value, nameAr, nameFr }) => ({ code: Number(value), nameAr, nameFr })),
  ).toEqual(
    official.map(({ code_commune, name_ar, name_fr }) => ({
      code: code_commune,
      nameAr: name_ar,
      nameFr: name_fr,
    })),
  );
  const rings = features.flatMap(({ geometry }) => geometry.coordinates.flat());
  for (const ring of rings) {
    expect(ring[0]).toEqual(ring.at(-1));
  }
});

test("a centroid can only join to its commune code and verified wilaya", () => {
  const labels = [
    { code: "0101", wilayaCode: 1, nameAr: "أدرار", nameFr: "Adrar" },
    { code: "1601", wilayaCode: 16, nameAr: "الجزائر الوسطى", nameFr: "Alger centre" },
  ];
  const points = [
    { code: "1601", wilayaCode: 16, longitude: 3.05, latitude: 36.76 },
    { code: "0101", wilayaCode: 1, longitude: -0.3, latitude: 27.87 },
  ];
  expect(joinCentroids(labels, points)).toEqual([
    { ...labels[0], centroid: { longitude: -0.3, latitude: 27.87 } },
    { ...labels[1], centroid: { longitude: 3.05, latitude: 36.76 } },
  ]);
  expect(() =>
    joinCentroids(
      labels,
      points.map((point) => ({ ...point, wilayaCode: 2 })),
    ),
  ).toThrow(/wilaya/);
  expect(() =>
    joinCentroids(
      labels,
      points.map((point) => ({ ...point, code: "1601" })),
    ),
  ).toThrow(/unique/);
});
