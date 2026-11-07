import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import type { DatabaseConnection } from "./database.ts";

const fixtureDirectory = new URL("../fixtures/geography/", import.meta.url);

export async function seedGeography({ sql }: DatabaseConnection): Promise<void> {
  const [wilayas, communes, compressedAlgiers] = await Promise.all([
    readFile(new URL("wilayas.json", fixtureDirectory), "utf8"),
    readFile(new URL("communes.json", fixtureDirectory), "utf8"),
    readFile(new URL("algiers-boundaries.geojson.gz", fixtureDirectory)),
  ]);
  const algiers = gunzipSync(compressedAlgiers).toString("utf8");

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO public.wilayas (code, name_ar, name_fr)
      SELECT code, "nameAr", "nameFr"
      FROM jsonb_to_recordset(${wilayas}::jsonb) AS wilaya(code smallint, "nameAr" text, "nameFr" text)
      ORDER BY code
      ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr
    `;

    await transaction`
      WITH boundaries AS (
        SELECT feature -> 'properties' ->> 'code' AS code,
          ST_GeomFromGeoJSON(feature -> 'geometry') AS boundary
        FROM jsonb_array_elements(${algiers}::jsonb -> 'features') AS feature
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
      LEFT JOIN boundaries ON boundaries.code = commune.code AND commune."wilayaCode" = 16
      ORDER BY commune.code
      ON CONFLICT (code) DO UPDATE SET wilaya_code = EXCLUDED.wilaya_code,
        name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr,
        centroid = EXCLUDED.centroid, boundary = EXCLUDED.boundary
    `;
  });
}
