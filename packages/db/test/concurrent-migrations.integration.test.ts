import { expect, inject, test } from "vitest";
import { openDatabase } from "../src/database.ts";
import { migrateDatabase } from "../src/migrate.ts";
import { createTestClone } from "./clone.ts";

test("[M0-5] concurrent migrations record each migration once on a fresh database", async () => {
  const { adminUrl } = inject("testDatabase");
  const clone = await createTestClone(adminUrl, "template0");
  const first = openDatabase(clone.url);
  const second = openDatabase(clone.url);

  try {
    await Promise.all([first.sql`select 1`, second.sql`select 1`]);
    const results = await Promise.allSettled([migrateDatabase(first), migrateDatabase(second)]);
    expect(results).toEqual([
      { status: "fulfilled", value: undefined },
      { status: "fulfilled", value: undefined },
    ]);

    const history = await first.sql<{ applications: number }[]>`
      select count(*)::int as applications
      from drizzle.__drizzle_migrations
      group by created_at
    `;
    expect(history.length).toBeGreaterThan(0);
    expect(history.every(({ applications }) => applications === 1)).toBe(true);
  } finally {
    await Promise.all([first.close(), second.close()]);
    await clone.drop();
  }
});
