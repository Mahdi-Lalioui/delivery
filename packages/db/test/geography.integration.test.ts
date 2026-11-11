import { expect, test } from "vitest";
import { readCommuneCoordinates, readWilayas, seedGeography } from "../src/geography.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();

test("[MER-01:db] seeds all official commune codes and boundaries without replacing IDs", async () => {
  const connection = database.get();
  const { sql } = connection;
  await seedGeography(connection);

  const [counts] = await sql`
    SELECT (SELECT count(*)::int FROM wilayas) AS wilayas,
      count(*)::int AS communes,
      count(DISTINCT code)::int AS distinct_codes,
      count(boundary)::int AS boundaries,
      count(*) FILTER (WHERE wilaya_code = 16 AND boundary IS NOT NULL)::int AS algiers_boundaries,
      count(*) FILTER (
        WHERE ST_SRID(boundary) = 4326 AND GeometryType(boundary) = 'MULTIPOLYGON'
          AND ST_IsValid(boundary) AND NOT ST_IsEmpty(boundary)
      )::int AS valid_boundaries,
      count(*) FILTER (
        WHERE ST_SRID(centroid::geometry) = 4326 AND GeometryType(centroid::geometry) = 'POINT'
      )::int AS valid_centroids
    FROM communes
  `;
  expect(counts).toEqual({
    wilayas: 69,
    communes: 1541,
    distinct_codes: 1541,
    boundaries: 1541,
    algiers_boundaries: 57,
    valid_boundaries: 1541,
    valid_centroids: 1541,
  });

  const [oran] = await sql`
    SELECT ST_Covers(boundary, ST_SetSRID(ST_MakePoint(-0.64, 35.7), 4326)) AS contains_city
    FROM public.communes WHERE code = '3101'
  `;
  expect(oran).toEqual({ contains_city: true });
  const directory = await readWilayas(connection);
  expect(directory.map(({ code }) => code)).toEqual(
    Array.from({ length: 69 }, (_, index) => index + 1),
  );
  expect(directory.at(-1)).toEqual({
    code: 69,
    nameAr: "الأبيض سيدي الشيخ",
    nameFr: "El Abiodh Sidi Cheikh",
  });
  const original = await sql`SELECT code, id FROM communes ORDER BY code`;
  await sql`UPDATE wilayas SET name_fr = 'Previous label' WHERE code = 16`;
  await sql`
    UPDATE communes SET name_ar = 'اسم سابق', name_fr = 'Previous label', boundary = NULL,
      centroid = ST_SetSRID(ST_MakePoint(0, 0), 4326)::geography
    WHERE code = '1601'
  `;

  await Promise.all([seedGeography(connection), seedGeography(connection)]);

  expect(await sql`SELECT code, id FROM communes ORDER BY code`).toEqual(original);
  const [wilaya] = await sql`SELECT name_fr FROM wilayas WHERE code = 16`;
  expect(wilaya?.name_fr).toBe("Alger");
  const [algiers] = await sql`
    SELECT name_ar, name_fr, boundary IS NOT NULL AS has_boundary,
      ST_X(centroid::geometry) AS longitude, ST_Y(centroid::geometry) AS latitude
    FROM communes WHERE code = '1601' AND wilaya_code = 16
  `;
  expect(algiers).toEqual({
    name_ar: "الجزائر الوسطى",
    name_fr: "Alger centre",
    has_boundary: true,
    longitude: 3.0574036,
    latitude: 36.7666581,
  });
});

test("[MER-01:db] rolls back wilaya changes when a commune cannot be seeded", async () => {
  const connection = database.get();
  const { sql } = connection;
  await sql`
    INSERT INTO wilayas (code, name_ar, name_fr) VALUES (16, 'اسم سابق', 'Previous label')
    ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_fr = EXCLUDED.name_fr
  `;
  const original = await sql`SELECT * FROM wilayas ORDER BY code`;
  await sql`ALTER TABLE communes ADD CONSTRAINT reject_seed_commune CHECK (code <> '1601') NOT VALID`;

  try {
    await expect(seedGeography(connection)).rejects.toMatchObject({ code: "23514" });
    expect(await sql`SELECT * FROM wilayas ORDER BY code`).toEqual(original);
  } finally {
    await sql`ALTER TABLE communes DROP CONSTRAINT reject_seed_commune`;
  }
});

test("[HRS-03:db] resolves the seeded Algiers centroid by commune ID", async () => {
  const connection = database.get();
  await seedGeography(connection);
  const [commune] = await connection.sql<{ id: string }[]>`
    SELECT id FROM public.communes WHERE code = '1601'
  `;
  if (!commune) throw new Error("Expected the seeded Algiers commune.");
  await expect(readCommuneCoordinates(connection, commune.id)).resolves.toEqual({
    longitude: 3.0574036,
    latitude: 36.7666581,
  });
  await expect(
    readCommuneCoordinates(connection, "01932f18-3150-7c33-8a7a-53acfd343001"),
  ).resolves.toBeUndefined();
});
