import { expect, test } from "vitest";
import { registerTestDatabase } from "./database.ts";

const database = registerTestDatabase();

test("[M0-5] the isolation suite sees only its own scratch row", async () => {
  const { sql } = database.get();
  expect(database.name()).not.toBe("zaafran_test");

  await sql`create table isolation_probe (marker text primary key)`;
  await sql`insert into isolation_probe values ('isolation')`;
  const rows = await sql`
    select current_database()::text as database, marker from isolation_probe
  `;

  expect([...rows]).toEqual([{ database: database.name(), marker: "isolation" }]);
});
