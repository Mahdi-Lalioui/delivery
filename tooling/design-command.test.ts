import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const designTag = "@design-screens";

function readScript(name: string): string {
  const manifest: unknown = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(typeof manifest === "object" && manifest !== null && "scripts" in manifest);
  const { scripts } = manifest;
  assert.ok(typeof scripts === "object" && scripts !== null && name in scripts);
  const command: unknown = Object.entries(scripts).find(([key]) => key === name)?.[1];
  assert.ok(typeof command === "string");
  return command;
}

void test("[M2-gate] the design screens command runs the tagged authenticated matrix journeys", () => {
  const command = readScript("test:design");
  assert.ok(command.includes("--config e2e/auth.config.ts"));
  assert.ok(command.includes("--grep " + designTag));
  const gate = readFileSync("scripts/gate.ts", "utf8");
  assert.ok(gate.includes('["design:screens", ["test:design"]]'));
});

void test("[M2-gate] every authenticated journey with a design matrix carries the design tag", () => {
  const specs = readdirSync("e2e").filter((name) => /^auth-.+\.spec\.ts$/.test(name));
  const withMatrix = specs.filter((name) =>
    readFileSync(`e2e/${name}`, "utf8").includes("attachPageScreenshot("),
  );
  assert.ok(withMatrix.length > 0);
  const untagged = withMatrix.filter(
    (name) => !readFileSync(`e2e/${name}`, "utf8").includes(designTag),
  );
  assert.deepEqual(untagged, []);
});
