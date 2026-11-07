import { expect, test } from "vitest";
import { migrateDatabase } from "../src/migrate.ts";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();

async function readMigrationHistory(): Promise<string[]> {
  const migrations = await database.get().sql<{ hash: string }[]>`
    select hash from drizzle.__drizzle_migrations order by id
  `;
  return migrations.map(({ hash }) => hash);
}

test("[M0-5] clones have working PostGIS, trigram matching, and accent removal", async () => {
  const [result] = await database.get().sql`
    select
      st_covers(
        st_makeenvelope(3.04, 36.75, 3.07, 36.78, 4326),
        st_setsrid(st_makepoint(3.0562, 36.7631), 4326)
      ) as covers_point,
      similarity('zaafran', 'zaafran') = 1 as matches_exactly,
      unaccent('Café') as normalized_name
  `;

  expect(result).toEqual({
    covers_point: true,
    matches_exactly: true,
    normalized_name: "Cafe",
  });
});

test("[M0-5] PostgreSQL generates version 7 identifiers", async () => {
  const [result] = await database.get().sql`select uuid_extract_version(uuidv7()) as version`;

  expect(result).toEqual({ version: 7 });
});

test("[M0-5] rerunning migrations preserves the applied migration history", async () => {
  const before = await readMigrationHistory();
  expect(before.length).toBeGreaterThan(0);

  await migrateDatabase(database.get());
  await migrateDatabase(database.get());

  expect(await readMigrationHistory()).toEqual(before);
});

test("[M0-5] the migration suite sees only its own scratch row", async () => {
  const { sql } = database.get();
  expect(database.name()).not.toBe("zaafran_test");

  // The isolation suite creates the same table in its own database.
  await sql`create table isolation_probe (marker text primary key)`;
  await sql`insert into isolation_probe values ('migrations')`;
  const rows = await sql`
    select current_database()::text as database, marker from isolation_probe
  `;

  expect([...rows]).toEqual([{ database: database.name(), marker: "migrations" }]);
});
