import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DatabaseConnection } from "./database.ts";

const migrationsFolder = fileURLToPath(new URL("../migrations/", import.meta.url));

export async function migrateDatabase(connection: DatabaseConnection): Promise<void> {
  await connection.db.transaction(
    async (transaction) => {
      // Serialize setup and ledger reads with the migration writes on this database.
      await transaction.execute(sql`select pg_advisory_xact_lock(890542, 2)`);
      await migrate(transaction, { migrationsFolder });
    },
    { isolationLevel: "read committed" },
  );
}
