import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const workerRoot = fileURLToPath(new URL("..", import.meta.url));

function runSeed(databaseUrl: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/seed-demo-media.ts"], {
    cwd: workerRoot,
    env: { PATH: process.env.PATH, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("refuses every database but the local development one, before connecting", () => {
  for (const url of [
    "postgresql://zaafran:secret@127.0.0.1:5432/zaafran_test",
    "postgresql://zaafran:secret@db.example.com:5432/zaafran_dev",
    "postgresql://zaafran:secret@127.0.0.1:5432/zaafran",
  ]) {
    const result = runSeed(url);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('"command":"seed-demo-media"');
    expect(result.stdout).not.toContain("Seeded demo dish photos");
    expect(result.stdout).not.toContain("secret");
  }
});
