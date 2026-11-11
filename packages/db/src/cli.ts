import process from "node:process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { openDatabase } from "./database.ts";
import { seedGeography } from "./geography.ts";
import { assertLocalDatabaseUrl, assertPostgres18Database } from "./local-database.ts";
import { migrateDatabase } from "./migrate.ts";

const developmentDatabase = "zaafran_dev";
const defaultDatabaseUrl = "postgresql://zaafran:zaafran_dev_only@127.0.0.1:5432/zaafran_dev";
const command = z.union([
  z.tuple([z.enum(["migrate", "seed"])]),
  z.tuple([z.literal("reset"), z.literal("--confirm")]),
]);

async function prepareDevelopmentDatabase(url: URL, action: "migrate" | "seed"): Promise<void> {
  const connection = openDatabase(url.href);
  try {
    await assertPostgres18Database(connection.sql, developmentDatabase);
    await migrateDatabase(connection);
    if (action === "seed") {
      await seedGeography(connection);
      const [{ createLocalMediaStore }, { seedDemoRestaurants }] = await Promise.all([
        import("@zaafran/media"),
        import("./demo-seed.ts"),
      ]);
      const root = process.env.MEDIA_STORAGE_ROOT ?? join(tmpdir(), "zaafran-media");
      await seedDemoRestaurants(connection, createLocalMediaStore({ root }));
    }
  } finally {
    await connection.close();
  }
}

async function resetDevelopmentDatabase(url: URL): Promise<void> {
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const maintenance = openDatabase(maintenanceUrl.href);
  try {
    using sql = await maintenance.sql.reserve();
    await assertPostgres18Database(sql, "postgres");
    const [role] = await sql<{ can_create_database: boolean }[]>`
      select rolcreatedb or rolsuper as can_create_database
      from pg_roles where rolname = current_user
    `;
    if (!role?.can_create_database) {
      throw new Error("Reset requires permission to recreate the development database.");
    }

    const [lock] = await sql<{ acquired: boolean }[]>`
      select pg_try_advisory_lock(890542, 1) as acquired
    `;
    if (!lock?.acquired) {
      throw new Error("Another development database reset is running.");
    }

    try {
      const name = sql.identifier(developmentDatabase);
      await sql`drop database if exists ${name}`;
      await sql`create database ${name} template template0`;
      await prepareDevelopmentDatabase(url, "migrate");
    } finally {
      await sql`select pg_advisory_unlock(890542, 1)`;
    }
  } finally {
    await maintenance.close();
  }
}

async function main(): Promise<void> {
  const args = command.safeParse(process.argv.slice(2));
  if (!args.success) {
    throw new Error("Usage: db:migrate, db:seed, or db:reset --confirm.");
  }

  const url = assertLocalDatabaseUrl(
    process.env.DATABASE_URL ?? defaultDatabaseUrl,
    developmentDatabase,
  );
  if (args.data[0] === "reset") {
    await resetDevelopmentDatabase(url);
    process.stdout.write("Rebuilt the local development database.\n");
    return;
  }

  await prepareDevelopmentDatabase(url, args.data[0]);
  if (args.data[0] === "seed") {
    process.stdout.write("Seeded geography and twelve fictional Algiers restaurants.\n");
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Database command failed."}\n`);
  process.exitCode = 1;
}
