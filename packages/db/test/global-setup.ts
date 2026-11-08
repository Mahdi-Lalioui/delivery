import process from "node:process";
import type { TestProject } from "vitest/node";
import { openDatabase } from "../src/database.ts";
import { migrateDatabase } from "../src/migrate.ts";
import { createTestClone } from "./clone.ts";

const defaultAdminUrl = "postgresql://zaafran:zaafran_dev_only@127.0.0.1:5432/zaafran_test";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const adminUrl = process.env.DATABASE_URL_TEST ?? defaultAdminUrl;
  const template = await createTestClone(adminUrl, "template0");

  try {
    const connection = openDatabase(template.url);
    try {
      await migrateDatabase(connection);
    } finally {
      await connection.close();
    }

    project.provide("testDatabase", { adminUrl, templateName: template.name });
    return template.drop;
  } catch (error) {
    try {
      await template.drop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Test database setup and cleanup failed.", {
        cause: cleanupError,
      });
    }
    throw error;
  }
}
