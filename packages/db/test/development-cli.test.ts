import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const localDatabaseUrl = "postgresql://127.0.0.1:5432/zaafran_dev";

function runCli(args: string[], databaseUrl: string) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

test("[M0-5] reset requires explicit confirmation", () => {
  const result = runCli(["reset"], localDatabaseUrl);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("reset --confirm");
});

test.each([
  "postgresql://example.com:5432/zaafran_dev",
  "postgresql://127.0.0.1:5432/zaafran_test",
  "postgresql://127.0.0.1:5432/zaafran_dev?host=example.com",
  "postgresql://127.0.0.1:5432/zaafran_dev#",
])("[M0-5] reset rejects unsafe database targets at %s", (databaseUrl) => {
  const result = runCli(["reset", "--confirm"], databaseUrl);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("loopback PostgreSQL URL for /zaafran_dev");
});
