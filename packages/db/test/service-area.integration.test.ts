import { beforeAll, expect, test } from "vitest";
import { seedGeography } from "../src/geography.ts";
import { createServiceAreaRepository } from "../src/service-area.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();

beforeAll(async () => {
  await Promise.all([seedGeography(database.get()), seedGeography(database.get())]);
});

test("[GEO-01:db] seeds urban Algiers coverage without overwriting an edited polygon", async () => {
  const connection = database.get();
  const { sql } = connection;

  const [seeded] = await sql<{ id: string; polygon: string; centre: boolean; outside: boolean }[]>`
    SELECT id, polygon::text,
      ST_Covers(polygon, ST_SetSRID(ST_MakePoint(3.06, 36.762), 4326)::geography) AS centre,
      ST_Covers(polygon, ST_SetSRID(ST_MakePoint(2.8397, 36.7132), 4326)::geography) AS outside
    FROM public.service_areas WHERE slug = 'algiers-launch' AND active
  `;
  expect(seeded).toMatchObject({ centre: true, outside: false });
  if (!seeded) throw new Error("Expected Algiers launch coverage.");

  try {
    const [edited] = await sql`
      UPDATE public.service_areas
      SET active = false, polygon = ST_Multi(ST_MakeEnvelope(3.04, 36.75, 3.05, 36.76, 4326))::geography
      WHERE id = ${seeded.id}
      RETURNING id, active, polygon::text
    `;

    await seedGeography(connection);
    await expect(sql`
      SELECT id, active, polygon::text FROM public.service_areas WHERE slug = 'algiers-launch'
    `).resolves.toEqual([edited]);
  } finally {
    await sql`
      UPDATE public.service_areas SET active = true, polygon = ${seeded.polygon}::geography
      WHERE id = ${seeded.id}
    `;
  }
});

test("[GEO-01:db] rejects an invalid service-area polygon", async () => {
  await expect(database.get().sql`
    INSERT INTO public.service_areas (slug, city, polygon)
    VALUES ('invalid', 'Alger',
      'SRID=4326;MULTIPOLYGON(((3 36, 4 37, 4 36, 3 37, 3 36)))'::geography)
  `).rejects.toMatchObject({ code: "23514" });
});

test("[CUS-02:db] resolves a GPS pin to its commune and active service area", async () => {
  const connection = database.get();
  const repository = createServiceAreaRepository(connection);
  const [expected] = await connection.sql`
    SELECT commune.id AS "communeId", area.id AS "serviceAreaId"
    FROM public.communes AS commune, public.service_areas AS area
    WHERE commune.code = '1601' AND area.slug = 'algiers-launch'
  `;

  await expect(
    repository.resolve({ kind: "point", longitude: 3.06, latitude: 36.762 }),
  ).resolves.toEqual({ longitude: 3.06, latitude: 36.762, ...expected });
});

test("[GEO-01:db] covers an exact polygon boundary vertex only while the area is active", async () => {
  const connection = database.get();
  const { sql } = connection;
  const repository = createServiceAreaRepository(connection);
  const [area] = await sql<{ id: string }[]>`
    INSERT INTO public.service_areas (slug, city, polygon, active)
    VALUES ('boundary-fixture', 'Fixture',
      ST_Multi(ST_MakeEnvelope(-0.65, 35.69, -0.64, 35.70, 4326))::geography, true)
    RETURNING id
  `;
  if (!area) throw new Error("Expected the boundary test area.");

  const pin = { kind: "point", longitude: -0.65, latitude: 35.69 } as const;
  const location = { longitude: -0.65, latitude: 35.69, communeId: null };
  await expect(repository.resolve(pin)).resolves.toEqual({ ...location, serviceAreaId: area.id });

  await sql`UPDATE public.service_areas SET active = false WHERE id = ${area.id}`;
  await expect(repository.resolve(pin)).resolves.toEqual({ ...location, serviceAreaId: null });
});

test("[CUS-02:db] distinguishes an unserved commune from an unknown commune", async () => {
  const connection = database.get();
  const repository = createServiceAreaRepository(connection);
  const [commune] = await connection.sql<{ id: string }[]>`
    SELECT id FROM public.communes WHERE code = '0101'
  `;
  if (!commune) throw new Error("Expected the seeded Adrar commune.");

  await expect(repository.resolve({ kind: "commune", communeId: commune.id })).resolves.toEqual({
    communeId: commune.id,
    latitude: 27.9544661,
    longitude: -0.1903272,
    serviceAreaId: null,
  });
  await expect(
    repository.resolve({ kind: "commune", communeId: "01932f18-3150-7c33-8a7a-53acfd343001" }),
  ).resolves.toBeUndefined();
});

test("[CUS-02:db] keeps a selected commune location inside a concave boundary", async () => {
  const connection = database.get();
  const { sql } = connection;
  const repository = createServiceAreaRepository(connection);
  const [commune] = await sql<{ id: string }[]>`
    INSERT INTO public.communes (code, wilaya_code, name_ar, name_fr, centroid, boundary)
    VALUES ('9999', 16, 'بلدية اختبار', 'Commune de test',
      'SRID=4326;POINT(1 31)'::geography,
      'SRID=4326;MULTIPOLYGON(((0 30, 2 30, 2 32, 1.5 32, 1.5 30.5, 0.5 30.5, 0.5 32, 0 32, 0 30)))'::geometry)
    RETURNING id
  `;
  if (!commune) throw new Error("Expected the concave test commune.");

  const location = await repository.resolve({ kind: "commune", communeId: commune.id });
  if (!location) throw new Error("Expected the selected commune location.");
  expect(location).toMatchObject({ communeId: commune.id, serviceAreaId: null });
  await expect(sql`
    SELECT ST_Contains(boundary,
      ST_SetSRID(ST_MakePoint(${location.longitude}, ${location.latitude}), 4326)) AS inside
    FROM public.communes WHERE id = ${commune.id}
  `).resolves.toEqual([{ inside: true }]);
});
