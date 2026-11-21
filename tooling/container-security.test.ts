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

void test("ClamAV signature refresh uses unprivileged initialization without extra caps", async () => {
  const compose = await readFile("infra/compose.production.yml", "utf8");
  const updater = compose.split("  clamav-signatures:\n")[1]?.split("\n  clamav:")[0] ?? "";
  assert.match(updater, /^ {4}user: clamav$/mu);
  assert.match(updater, /^ {4}entrypoint: \[\/init-unprivileged\]$/mu);
  assert.match(updater, /^ {4}cap_drop: \[ALL\]$/mu);
  assert.doesNotMatch(updater, /^ {4}cap_add:/mu);
});

void test("dynamic edge addresses stay separate from the trusted Caddy address", async () => {
  const compose = await readFile("infra/compose.production.yml", "utf8");
  assert.ok(compose.includes('ip_range: "${AWID_EDGE_IP_RANGE:-172.29.78.128/25}"'));
  assert.ok(compose.includes('ipv4_address: "${AWID_PROXY_IP:-172.29.78.2}"'));
  assert.ok(compose.includes('API_TRUSTED_PROXY: "${AWID_PROXY_IP:-172.29.78.2}/32"'));
});
