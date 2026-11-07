import { randomUUID } from "node:crypto";
import { openDatabase } from "../src/database.ts";
import { assertPostgres18Database } from "../src/local-database.ts";
import { assertTestAdminUrl } from "./safety.ts";

type AdminSql = ReturnType<typeof openDatabase>["sql"];

declare module "vitest" {
  interface ProvidedContext {
    testDatabase: { adminUrl: string; templateName: string };
  }
}

async function withTestAdmin<T>(adminUrl: string, operation: (sql: AdminSql) => Promise<T>) {
  const url = assertTestAdminUrl(adminUrl);
  const admin = openDatabase(url.href);
  try {
    await assertPostgres18Database(admin.sql, "zaafran_test");
    return await operation(admin.sql);
  } finally {
    await admin.close();
  }
}

export async function createTestClone(adminUrl: string, template: string) {
  const name = `zaafran_test_${randomUUID().replaceAll("-", "")}`;
  const url = assertTestAdminUrl(adminUrl);
  url.pathname = `/${name}`;

  await withTestAdmin(adminUrl, async (sql) => {
    await sql`create database ${sql.identifier(name)} template ${sql.identifier(template)}`;
  });

  return {
    name,
    url: url.href,
    drop: () =>
      withTestAdmin(adminUrl, async (sql) => {
        await sql`alter database ${sql.identifier(name)} allow_connections false`;
        await sql`drop database ${sql.identifier(name)}`;
      }),
  };
}
