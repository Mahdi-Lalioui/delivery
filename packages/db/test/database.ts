import { afterAll, beforeAll, inject } from "vitest";
import { openDatabase } from "../src/database.ts";
import type { DatabaseConnection } from "../src/database.ts";
import { createTestClone } from "./clone.ts";

export function registerTestDatabase() {
  let clone: Awaited<ReturnType<typeof createTestClone>> | undefined;
  let connection: DatabaseConnection | undefined;

  beforeAll(async () => {
    const { adminUrl, templateName } = inject("testDatabase");
    clone = await createTestClone(adminUrl, templateName);
    connection = openDatabase(clone.url);
  });

  afterAll(async () => {
    await connection?.close();
    await clone?.drop();
  });

  return {
    get() {
      if (!connection) {
        throw new Error("The test database is only available after setup.");
      }
      return connection;
    },
    name() {
      if (!clone) {
        throw new Error("The test database is only available after setup.");
      }
      return clone.name;
    },
    url() {
      if (!clone) {
        throw new Error("The test database is only available after setup.");
      }
      return clone.url;
    },
  };
}
