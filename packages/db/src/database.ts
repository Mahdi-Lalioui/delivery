import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function openDatabase(databaseUrl: string) {
  const sql = postgres(databaseUrl);

  return {
    sql,
    db: drizzle(sql),
    close: () => sql.end({ timeout: 5 }),
  };
}

export type DatabaseConnection = ReturnType<typeof openDatabase>;
