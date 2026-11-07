import type { ISql } from "postgres";
import { z } from "zod";

const loopbackPostgresUrl = z
  .url({
    protocol: /^postgres(?:ql)?$/,
    hostname: /^(?:localhost|127\.0\.0\.1|\[::1\])$/,
  })
  .transform((value) => new URL(value));

export function assertLocalDatabaseUrl(value: string, name: "zaafran_dev" | "zaafran_test"): URL {
  const parsed = loopbackPostgresUrl.safeParse(value);
  if (parsed.success && parsed.data.pathname === `/${name}` && !/[?#]/.test(parsed.data.href)) {
    return parsed.data;
  }

  throw new Error(`Expected a loopback PostgreSQL URL for /${name} without query or fragment.`);
}

export async function assertPostgres18Database(sql: ISql, name: string): Promise<void> {
  const [server] = await sql<{ name: string; version: number }[]>`
    select current_database() as name, current_setting('server_version_num')::int as version
  `;
  if (server?.name !== name || Math.trunc(server.version / 10_000) !== 18) {
    throw new Error(`Expected the local ${name} database on PostgreSQL 18.`);
  }
}
