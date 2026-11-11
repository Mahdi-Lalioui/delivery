import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { openDatabase } from "../../src/database.ts";
import { createTestClone } from "../../test/clone.ts";

const sourceDigests = {
  labels: "2658967ab74bb0f98ab3a999586a9de772bc0c56a3934552efe45eb543726d72",
  algiers: "51e4326b7d88dc4f4c8030ad2183e83495aa98500024d314ac1d78538725ba03",
  boundaries: "02085a4cc17096c9b2bb2c520eeabeb6789627dc6c2ccb3b3ee1dac9cf1fc6f9",
};
const wilayaCount = 69;
const communeCount = 1_541;
const algiersCount = 57;
const algiersWilaya = 16;
const defaultAdminUrl = "postgresql://zaafran:zaafran_dev_only@127.0.0.1:5432/zaafran_test";

const sourceLabel = z.object({
  name_ar: z.string().trim().min(1),
  name_fr: z.string().trim().min(1),
});
const sourceCommune = sourceLabel.extend({
  code_commune: z.int().positive().max(9_999),
  wilaya_code: z.int().min(1).max(wilayaCount),
});
const sourceCatalog = z.array(
  sourceLabel.extend({
    code: z.int().min(1).max(wilayaCount),
    communes: z.array(sourceCommune),
  }),
);
const communeCode = z.string().regex(/^\d{4}$/);
const longitude = z.number().min(-9).max(13);
const latitude = z.number().min(18).max(38);
const coordinate = z.tuple([longitude, latitude]);
const polygon = z.array(z.array(coordinate).min(4)).min(1);
const multipolygon = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(polygon).min(1),
});
const sourceFeatures = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.object({
        ons_commune_code: communeCode,
        wilaya_code: z.int().min(1).max(wilayaCount),
        osm_relation_id: z.int().positive(),
      }),
      geometry: multipolygon,
    }),
  ),
});
const centroidRow = z.object({
  code: communeCode,
  wilayaCode: z.int().min(1).max(wilayaCount),
  longitude,
  latitude,
  valid: z.literal(true),
  empty: z.literal(false),
});

type Feature = z.infer<typeof sourceFeatures>["features"][number];
interface CommuneLabel {
  code: string;
  wilayaCode: number;
  nameAr: string;
  nameFr: string;
}
type Centroid = Pick<z.infer<typeof centroidRow>, "code" | "wilayaCode" | "longitude" | "latitude">;

export function joinCentroids(labels: readonly CommuneLabel[], points: readonly Centroid[]) {
  const centroids = new Map(points.map((point) => [point.code, point]));
  if (centroids.size !== labels.length || centroids.size !== points.length) {
    throw new Error("Expected one unique centroid per commune code.");
  }
  return labels.map((label) => {
    const point = centroids.get(label.code);
    if (!point || point.wilayaCode !== label.wilayaCode) {
      throw new Error(`Centroid commune or wilaya does not match ${label.code}.`);
    }
    return { ...label, centroid: { longitude: point.longitude, latitude: point.latitude } };
  });
}

function readPinned(path: string | URL, digest: string): Buffer {
  const bytes = readFileSync(path);
  if (createHash("sha256").update(bytes).digest("hex") !== digest) {
    throw new Error(`Source SHA256 does not match for ${String(path)}.`);
  }
  return bytes;
}

function readLabels(catalogPath: string) {
  const bytes = readPinned(catalogPath, sourceDigests.labels);
  const source = execFileSync("tar", ["-xOzf", "-", "package/data/algeria.json"], {
    input: bytes,
    encoding: "utf8",
  });
  const catalog = sourceCatalog.parse(JSON.parse(source)).sort((a, b) => a.code - b.code);
  if (catalog.length !== wilayaCount || catalog.some((wilaya, i) => wilaya.code !== i + 1)) {
    throw new Error("Expected all 69 unique wilaya codes.");
  }

  const officialAlgiers = readPinned(
    new URL("./algiers-official-labels.json", import.meta.url),
    sourceDigests.algiers,
  );
  const official = z.array(sourceCommune).parse(JSON.parse(officialAlgiers.toString("utf8")));
  const overlay = new Map(official.map((commune) => [commune.code_commune, commune]));
  if (official.length !== algiersCount || overlay.size !== algiersCount) {
    throw new Error("Expected 57 distinct official Algiers labels.");
  }

  const wilayas = catalog.map(({ code, name_ar, name_fr }) => ({
    code,
    nameAr: name_ar,
    nameFr: name_fr,
  }));
  const communes = catalog.flatMap(({ code, communes: rows }) =>
    rows.map((row) => readCommuneLabel(code, row, overlay)),
  );
  communes.sort((a, b) => a.code.localeCompare(b.code, "en"));
  if (
    communes.length !== communeCount ||
    new Set(communes.map((row) => row.code)).size !== communeCount
  ) {
    throw new Error("Expected 1,541 unique commune codes.");
  }
  return { wilayas, communes };
}

function readCommuneLabel(
  wilayaCode: number,
  row: z.infer<typeof sourceCommune>,
  overlay: ReadonlyMap<number, z.infer<typeof sourceCommune>>,
): CommuneLabel {
  const source = wilayaCode === algiersWilaya ? overlay.get(row.code_commune) : row;
  if (!source || source.wilaya_code !== wilayaCode || row.wilaya_code !== wilayaCode) {
    throw new Error(`Commune label or wilaya does not match ${row.code_commune.toString()}.`);
  }
  return {
    code: row.code_commune.toString().padStart(4, "0"),
    wilayaCode,
    nameAr: source.name_ar,
    nameFr: source.name_fr,
  };
}

function readBoundaries(boundariesPath: string): Feature[] {
  const bytes = readPinned(boundariesPath, sourceDigests.boundaries);
  const { features } = sourceFeatures.parse(JSON.parse(bytes.toString("utf8")));
  const relations = new Set(features.map(({ properties }) => properties.osm_relation_id));
  if (features.length !== communeCount || relations.size !== communeCount) {
    throw new Error("Expected 1,541 unique OpenStreetMap commune relations.");
  }
  return features;
}

async function deriveCentroids(features: readonly Feature[]) {
  const rows = features.map(({ properties, geometry }) => ({
    code: properties.ons_commune_code,
    wilaya: properties.wilaya_code,
    geometry,
  }));
  await using resources = new AsyncDisposableStack();
  const clone = await createTestClone(
    process.env.DATABASE_URL_TEST ?? defaultAdminUrl,
    "template0",
  );
  resources.defer(clone.drop);
  const database = openDatabase(clone.url);
  resources.defer(() => database.close());
  await database.sql`CREATE EXTENSION postgis`;
  const [version] = await database.sql<
    { postgis: string }[]
  >`SELECT PostGIS_Lib_Version() AS postgis`;
  if (version?.postgis !== "3.7.0")
    throw new Error("PostGIS 3.7.0 is required to regenerate geography.");

  const result = await database.sql`
    WITH shapes AS MATERIALIZED (
      SELECT code, wilaya, ST_SetSRID(ST_GeomFromGeoJSON(geometry), 4326) AS geom
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS row(code text, wilaya integer, geometry jsonb)
    ), centres AS (
      SELECT code, wilaya, ST_IsValid(geom) AS valid, ST_IsEmpty(geom) AS empty,
        ST_Centroid(geom::geography, true)::geometry AS centre
      FROM shapes
    )
    SELECT code, wilaya AS "wilayaCode", valid, empty,
      round(ST_X(centre)::numeric, 7)::double precision AS longitude,
      round(ST_Y(centre)::numeric, 7)::double precision AS latitude
    FROM centres
  `;
  return z.array(centroidRow).parse(result);
}

function encodeBoundaries(features: readonly Feature[]) {
  const selected = features.map(({ geometry, properties, type }) => ({
    type,
    properties: { code: properties.ons_commune_code },
    geometry,
  }));
  selected.sort((a, b) => a.properties.code.localeCompare(b.properties.code, "en"));
  return gzipSync(JSON.stringify({ type: "FeatureCollection", features: selected }) + "\n", {
    level: 9,
  });
}

function saveFixture(name: string, bytes: Buffer, check: boolean): void {
  const path = new URL(`../../fixtures/geography/${name}`, import.meta.url);
  if (check) {
    if (!bytes.equals(readFileSync(path))) throw new Error(`Regenerated ${name} differs.`);
  } else {
    writeFileSync(path, bytes);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(`${digest}  ${name}\n`);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { check: { type: "boolean" } },
  });
  const [catalogPath, boundariesPath, extra] = positionals;
  if (!catalogPath || !boundariesPath || extra !== undefined) {
    throw new Error("Usage: node generate.ts [--check] GEOALGERIA.tgz OSM-BOUNDARIES.geojson");
  }

  const { wilayas, communes } = readLabels(catalogPath);
  const features = readBoundaries(boundariesPath);
  const centroids = await deriveCentroids(features);
  const check = values.check ?? false;
  saveFixture("wilayas.json", Buffer.from(JSON.stringify(wilayas, null, 2) + "\n"), check);
  saveFixture(
    "communes.json",
    Buffer.from(JSON.stringify(joinCentroids(communes, centroids), null, 2) + "\n"),
    check,
  );
  const algiers = features.filter(({ properties }) => properties.wilaya_code === algiersWilaya);
  if (algiers.length !== algiersCount) throw new Error("Expected 57 Algiers boundaries.");
  saveFixture("algiers-boundaries.geojson.gz", encodeBoundaries(algiers), check);
  saveFixture("algeria-boundaries.geojson.gz", encodeBoundaries(features), check);
}

if (import.meta.main) await main();
