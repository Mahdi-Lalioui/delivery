import type { wilayaListOutput } from "@zaafran/contracts/merchant";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import type { DatabaseConnection } from "./database.ts";

const fixtureDirectory = new URL("../fixtures/geography/", import.meta.url);
const pendingSeeds = new WeakMap<DatabaseConnection, Promise<void>>();

async function writeGeography({ sql }: DatabaseConnection): Promise<void> {
  const [wilayas, communes, compressedBoundaries] = await Promise.all([
    readFile(new URL("wilayas.json", fixtureDirectory), "utf8"),
    readFile(new URL("communes.json", fixtureDirectory), "utf8"),
    readFile(new URL("algeria-boundaries.geojson.gz", fixtureDirectory)),
  ]);
  const boundaries = gunzipSync(compressedBoundaries).toString("utf8");

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO public.wilayas (code, name_ar, name_fr)
      SELECT code, "nameAr", "nameFr"
      FROM jsonb_to_recordset(${wilayas}::jsonb) AS wilaya(code smallint, "nameAr" text, "nameFr" text)
      ORDER BY code
      ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr
      WHERE (wilayas.name_ar, wilayas.name_fr) IS DISTINCT FROM (EXCLUDED.name_ar, EXCLUDED.name_fr)
    `;

    await transaction`
      WITH boundaries AS (
        SELECT feature -> 'properties' ->> 'code' AS code,
          ST_GeomFromGeoJSON(feature -> 'geometry') AS boundary
        FROM jsonb_array_elements(${boundaries}::jsonb -> 'features') AS feature
      )
      INSERT INTO public.communes (code, wilaya_code, name_ar, name_fr, centroid, boundary)
      SELECT commune.code, "wilayaCode", "nameAr", "nameFr",
        ST_SetSRID(ST_MakePoint(
          (centroid ->> 'longitude')::double precision,
          (centroid ->> 'latitude')::double precision
        ), 4326)::geography,
        boundaries.boundary
      FROM jsonb_to_recordset(${communes}::jsonb) AS commune(
        code text, "wilayaCode" smallint, "nameAr" text, "nameFr" text, centroid jsonb
      )
      JOIN boundaries ON boundaries.code = commune.code
      ORDER BY commune.code
      ON CONFLICT (code) DO UPDATE SET wilaya_code = EXCLUDED.wilaya_code,
        name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr,
        centroid = EXCLUDED.centroid, boundary = EXCLUDED.boundary
      WHERE (communes.wilaya_code, communes.name_ar, communes.name_fr, communes.centroid, communes.boundary)
        IS DISTINCT FROM (EXCLUDED.wilaya_code, EXCLUDED.name_ar, EXCLUDED.name_fr, EXCLUDED.centroid, EXCLUDED.boundary)
    `;

    // The pilot footprint includes the inner Algiers communes and all demo restaurant communes.
    await transaction`
      INSERT INTO public.service_areas (slug, city, polygon, active)
      SELECT 'algiers-launch', 'Alger', ST_Multi(ST_Union(boundary))::geography, true
      FROM public.communes
      WHERE wilaya_code = 16 AND code BETWEEN '1601' AND '1632' AND boundary IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.service_areas WHERE slug = 'algiers-launch')
      GROUP BY wilaya_code
      ON CONFLICT (slug) DO NOTHING
    `;
  });
}

export function seedGeography(database: DatabaseConnection): Promise<void> {
  const pending = pendingSeeds.get(database);
  if (pending) return pending;
  const seed = writeGeography(database).finally(() => {
    pendingSeeds.delete(database);
  });
  pendingSeeds.set(database, seed);
  return seed;
}

export async function readCommuneCoordinates({ sql }: DatabaseConnection, communeId: string) {
  const [row] = await sql<{ latitude: number; longitude: number }[]>`
    SELECT ST_Y(centroid::geometry) AS latitude, ST_X(centroid::geometry) AS longitude
    FROM public.communes
    WHERE id = ${communeId}::uuid
  `;
  return row;
}

export async function readWilayas({
  sql,
}: DatabaseConnection): Promise<ReturnType<typeof wilayaListOutput.parse>["wilayas"]> {
  return sql<{ code: number; nameAr: string; nameFr: string }[]>`
    SELECT code, name_ar AS "nameAr", name_fr AS "nameFr" FROM public.wilayas ORDER BY code
  `;
}
