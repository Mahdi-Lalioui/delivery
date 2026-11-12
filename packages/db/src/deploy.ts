import process from "node:process";
import { z } from "zod";
import { openDatabase } from "./database.ts";
import { seedGeography } from "./geography.ts";
import { migrateDatabase } from "./migrate.ts";

const url = z.url({ protocol: /^postgres(?:ql)?$/ }).safeParse(process.env.DATABASE_URL);
if (!url.success) {
  process.stderr.write("The deployment database URL is missing or invalid.\n");
  process.exitCode = 1;
} else {
  const database = openDatabase(url.data);
  try {
    await migrateDatabase(database);
    await seedGeography(database);
    process.stdout.write("Application migrations and Algeria geography ready.\n");
  } catch {
    process.stderr.write(
      "Deployment database setup failed. Check the database and migration state.\n",
    );
    process.exitCode = 1;
  } finally {
    await database.close();
  }
}
