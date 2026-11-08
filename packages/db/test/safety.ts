import { assertLocalDatabaseUrl } from "../src/local-database.ts";

export function assertTestAdminUrl(value: string): URL {
  return assertLocalDatabaseUrl(value, "zaafran_test");
}
