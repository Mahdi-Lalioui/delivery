import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const routeSuiteGlob = "apps/api/test/*-http.test.ts";

function readAuthzCommand(): string {
  const manifest: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(typeof manifest === "object" && manifest !== null && "scripts" in manifest);
  const { scripts } = manifest;
  assert.ok(typeof scripts === "object" && scripts !== null && "test:authz" in scripts);
  const command = scripts["test:authz"];
  assert.ok(typeof command === "string");
  return command;
}

void test("the authorization matrix command runs the policy and every API route suite", () => {
  const command = readAuthzCommand();
  assert.ok(command.includes("apps/api/test/policy.test.ts"));
  const suites = readdirSync("apps/api/test").filter((name) => name.endsWith("-http.test.ts"));
  assert.ok(suites.length > 0);
  const missing = suites.filter(
    (name) => !command.includes(routeSuiteGlob) && !command.includes(`apps/api/test/${name}`),
  );
  assert.deepEqual(missing, []);
});
