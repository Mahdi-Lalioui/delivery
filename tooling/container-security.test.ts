import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

void test("ClamAV image performs package updates as root then runs as clamav", async () => {
  const dockerfile = await readFile("infra/deploy/Dockerfile.clamav", "utf8");
  const users = dockerfile.match(/^USER\s+(\S+)$/gmu)?.map((line) => line.slice(5));
  const rootSwitch = dockerfile.indexOf("USER root");
  const packageUpdate = dockerfile.indexOf("apk upgrade --no-cache");
  const versionCheck = dockerfile.indexOf('clamscan --version | grep -F "ClamAV 1.5.5"');
  const clamavSwitch = dockerfile.indexOf("USER clamav");

  assert.match(dockerfile, /^FROM clamav\/clamav:1\.5\.5_base@sha256:[a-f0-9]{64}$/mu);
  assert.deepEqual(users, ["root", "clamav"]);
  assert.ok(rootSwitch >= 0 && rootSwitch < packageUpdate);
  assert.ok(packageUpdate < versionCheck && versionCheck < clamavSwitch);
});
