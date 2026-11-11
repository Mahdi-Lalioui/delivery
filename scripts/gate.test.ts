import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gateCommand, getGateChecks, parseGates, resolveGate, runGate } from "./gate-plan.ts";

function gateSection(...definitions: string[]): string {
  return ["## Gate definitions for `pnpm gate`", "", "```", ...definitions, "```"].join("\n");
}

void test("[M0-3] reads the gate registry without treating examples as definitions", () => {
  const plan = [
    "## Examples",
    "```",
    "m0: example",
    "```",
    gateSection("m0: verify, e2e:@smoke", "m3: verify, lighthouse:home,restaurant"),
    "## Appendix",
    "```",
    "m1: example",
    "```",
  ].join("\n");

  assert.deepEqual(
    parseGates(plan),
    new Map([
      ["m0", ["verify", "e2e:@smoke"]],
      ["m3", ["verify", "lighthouse:home,restaurant"]],
    ]),
  );
});

void test("[M0-3] rejects a plan without a fenced gate registry", () => {
  const plan = "## Gate definitions for `pnpm gate`\n\nm0: verify\n";

  assert.throws(() => parseGates(plan));
});

void test("[M0-3] rejects duplicate gate definitions", () => {
  assert.throws(() => parseGates(gateSection("m0: verify", "m0: e2e:@smoke")));
});

void test("[M0-3] rejects a command token containing shell syntax", () => {
  assert.throws(() => parseGates(gateSection("m0: verify; echo compromised")));
});

void test("[M0-3] rejects an empty gate definition", () => {
  assert.throws(() => parseGates(gateSection("m0:")));
});

void test("[M0-3] rejects an executable M0 gate with required checks removed", () => {
  const plan = gateSection("m0: verify, e2e:@smoke, tokens:contrast");
  assert.throws(() => getGateChecks(plan, "m0"), /ci:pr/);
});

void test("[M0-3] keeps verification mandatory in every executable gate", () => {
  assert.throws(() => getGateChecks(gateSection("m11: maestro:@partner"), "m11"), /verify/);
});

void test("[M1-7] rejects a domain gate that omits mutation analysis", () => {
  const plan = gateSection("m1: verify, coverage:domain, property:1000");
  assert.throws(() => getGateChecks(plan, "m1"), /mutation:domain/);
});

void test("[M0-3] rejects a raw gate invocation with an unrelated executable", () => {
  const script = fileURLToPath(new URL("./gate.ts", import.meta.url));
  const result = spawnSync(process.execPath, [script, "m0"], {
    encoding: "utf8",
    env: { ...process.env, npm_execpath: "/usr/bin/true", npm_lifecycle_event: "gate" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pnpm gate/);
});

void test("[M0-3] resolves release aliases to their canonical gates", () => {
  assert.equal(resolveGate("release-web"), "m9");
  assert.equal(resolveGate("release-mobile"), "m12");
  assert.equal(resolveGate("m0"), "m0");
});

void test("[M0-3] rejects invalid gate names", () => {
  for (const name of ["", "m01", "m13", "release", "m0; echo invalid"]) {
    assert.throws(() => resolveGate(name), `Accepted invalid gate name ${JSON.stringify(name)}`);
  }
});

void test("[M0-3] runs every gate check in order when they all pass", () => {
  const attempted: string[] = [];
  const status = runGate(["verify", "e2e:@smoke"], (check) => {
    attempted.push(check);
    return 0;
  });

  assert.equal(status, 0);
  assert.deepEqual(attempted, ["verify", "e2e:@smoke"]);
});

for (const [reason, exitCode] of [
  ["a failed check", 7],
  ["an unavailable check", 127],
] as const) {
  void test(`[M0-3] stops after ${reason} and returns its status`, () => {
    const attempted: string[] = [];
    const status = runGate(["verify", "e2e:@smoke", "tokens:contrast"], (check) => {
      attempted.push(check);
      return check === "e2e:@smoke" ? exitCode : 0;
    });

    assert.equal(status, exitCode);
    assert.deepEqual(attempted, ["verify", "e2e:@smoke"]);
  });
}

void test("[M2-gate] requires onboarding, authorization and design evidence", () => {
  const required = ["e2e:@merchant-onboarding", "authz:matrix", "design:screens"];
  for (const omitted of required) {
    const included = ["verify", ...required.filter((check) => check !== omitted)];
    const plan = gateSection("m2: " + included.join(", "));
    assert.throws(() => getGateChecks(plan, "m2"), {
      message: "Gate m2 is missing required checks: " + omitted,
    });
  }
  const checks = ["verify", ...required];
  assert.deepEqual(getGateChecks(gateSection("m2: " + checks.join(", ")), "m2"), checks);
});

void test("[M2-12] runs authenticated merchant onboarding and builder design checks", () => {
  assert.deepEqual(gateCommand("m2", "e2e:@merchant-onboarding"), [
    "test:e2e:auth",
    "--grep",
    "@merchant-onboarding",
    "--fail-on-flaky-tests",
  ]);
  assert.deepEqual(gateCommand("m2", "design:screens"), [
    "test:e2e:auth",
    "--grep",
    "@merchant-design",
    "--fail-on-flaky-tests",
  ]);
  assert.equal(gateCommand("m6", "design:screens"), undefined);
  assert.deepEqual(gateCommand("m0", "e2e:@smoke"), ["test:e2e", "--grep", "@smoke"]);
});

void test("[SRCH-06] runs discovery journeys and the search benchmark from the M3 gate", () => {
  assert.deepEqual(gateCommand("m3", "e2e:@discovery"), [
    "test:e2e:auth",
    "--grep",
    "@discovery",
    "--fail-on-flaky-tests",
  ]);
  assert.deepEqual(gateCommand("m3", "bench:search"), ["bench:search"]);
});
