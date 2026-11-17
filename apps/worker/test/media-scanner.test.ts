import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createClamScan } from "../src/media-scanner.js";

const roots: string[] = [];
const previousSecret = process.env.AWID_SCANNER_TEST_SECRET;

afterEach(async () => {
  if (previousSecret === undefined) delete process.env.AWID_SCANNER_TEST_SECRET;
  else process.env.AWID_SCANNER_TEST_SECRET = previousSecret;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("[SECURITY] ClamAV child process does not inherit worker secrets", async () => {
  process.env.AWID_SCANNER_TEST_SECRET = "synthetic-worker-secret";
  const root = await mkdtemp(join(tmpdir(), "awid-clamav-env-test-"));
  roots.push(root);
  const output = join(root, "inherited-environment");
  const executable = join(root, "scanner");
  await writeFile(
    executable,
    `#!/bin/sh\nprintf '%s' "\${AWID_SCANNER_TEST_SECRET-unset}" > '${output}'\n`,
    { mode: 0o700 },
  );
  await chmod(executable, 0o700);

  await expect(createClamScan(executable)(Buffer.from("synthetic image"))).resolves.toBe(true);
  await expect(readFile(output, "utf8")).resolves.toBe("unset");
});
