import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { findAcceptanceFiles } from "./trace-files.ts";

void test("[M0-3] accepts only files the current test runners discover", (context) => {
  const workspace = mkdtempSync(resolve(tmpdir(), "zaafran-trace-"));
  context.after(() => {
    rmSync(workspace, { recursive: true, force: true });
  });
  const discoverable = [
    "apps/api/test/policy.test.ts",
    "apps/api/test/production.integration.test.ts",
    "packages/tokens/test/contrast.test.ts",
    "e2e/foundation.spec.ts",
  ];
  const excluded = [
    "apps/api/integration/never-run.test.ts",
    "apps/web/e2e/unregistered.spec.ts",
    "apps/web/.next/unused.test.ts",
    "apps/mobile/test/not-yet-in-jest.test.ts",
    "e2e/unregistered.test.ts",
  ];
  for (const file of [...discoverable, ...excluded]) {
    const target = resolve(workspace, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "");
  }
  assert.deepEqual(findAcceptanceFiles(workspace).sort(), discoverable.sort());
});
