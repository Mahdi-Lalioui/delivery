const milestonePattern = /^m(?:[0-9]|1[0-2])$/;
const checkPattern = /^[a-z][a-z0-9-]*(?::@?[a-z0-9-]+(?:,[a-z0-9-]+)*)?$/;

export function resolveGate(name: string): string {
  if (name === "release-web") return "m9";
  if (name === "release-mobile") return "m12";
  if (milestonePattern.test(name)) return name;
  throw new Error("Unknown milestone gate: " + name);
}

function readGateBlock(plan: string): string {
  const section = plan.split(/^## Gate definitions for `pnpm gate`\s*$/m)[1];
  const body = section?.split(/^## /m)[0];
  const block = body?.match(/^```(?:text)?\r?\n([\s\S]+?)\r?\n```\s*$/m)?.[1];
  if (!block?.trim()) throw new Error("PLAN.md has no fenced gate registry.");
  return block;
}

export function parseGates(plan: string): ReadonlyMap<string, readonly string[]> {
  const gates = new Map<string, readonly string[]>();
  for (const line of readGateBlock(plan).split(/\r?\n/)) {
    const [, name, commands] = /^(\S+):\s+(.+)$/.exec(line) ?? [];
    if (!name || !commands || !milestonePattern.test(name)) {
      throw new Error("Invalid gate definition: " + line);
    }
    if (gates.has(name)) throw new Error("Duplicate milestone gate: " + name);
    const checks = commands.trim().split(/,\s+/);
    if (!checks.every((check) => checkPattern.test(check))) {
      throw new Error("Invalid command token in gate " + name + ".");
    }
    gates.set(name, checks);
  }
  return gates;
}

const requiredChecks: ReadonlyMap<string, readonly string[]> = new Map([
  ["m0", ["e2e:@smoke", "tokens:contrast", "ci:pr"]],
  ["m1", ["coverage:domain", "mutation:domain", "property:1000"]],
  ["m2", ["e2e:@merchant-onboarding", "authz:matrix", "design:screens"]],
]);

export function getGateChecks(plan: string, milestone: string): readonly string[] {
  const checks = parseGates(plan).get(milestone);
  if (!checks) throw new Error("Missing gate definition for " + milestone);
  if (!checks.includes("verify") && !checks.includes("verify:full")) {
    throw new Error("Gate " + milestone + " must include verify or verify:full.");
  }
  const missing = (requiredChecks.get(milestone) ?? []).filter((check) => !checks.includes(check));
  if (missing.length) {
    throw new Error("Gate " + milestone + " is missing required checks: " + missing.join(", "));
  }
  return checks;
}

export function runGate(checks: readonly string[], runCheck: (check: string) => number): number {
  if (checks.length === 0) throw new Error("Cannot run an empty milestone gate.");
  for (const check of checks) {
    const status = runCheck(check);
    if (status !== 0) return status;
  }
  return 0;
}

const commands: ReadonlyMap<string, readonly string[]> = new Map([
  ["verify", ["verify"]],
  ["verify:full", ["verify:full"]],
  ["tokens:contrast", ["--dir", "packages/tokens", "test:contrast"]],
  ["ci:pr", ["exec", "node", "scripts/check-pr.ts"]],
  ["coverage:domain", ["test:domain:coverage"]],
  ["mutation:domain", ["test:mutation"]],
  ["property:1000", ["test:properties"]],
  ["authz:matrix", ["test:authz"]],
  ["bench:search", ["bench:search"]],
]);

const merchantCheckTags: ReadonlyMap<string, string> = new Map([
  ["e2e:@merchant-onboarding", "@merchant-onboarding"],
  ["design:screens", "@merchant-design"],
]);

export function gateCommand(milestone: string, check: string): readonly string[] | undefined {
  const merchantTag = milestone === "m2" ? merchantCheckTags.get(check) : undefined;
  const authTag = milestone === "m3" && check === "e2e:@discovery" ? "@discovery" : merchantTag;
  if (authTag) return ["test:e2e:auth", "--grep", authTag, "--fail-on-flaky-tests"];
  const testTag = /^e2e:(@[a-z0-9-]+)$/.exec(check)?.[1];
  return testTag ? ["test:e2e", "--grep", testTag] : commands.get(check);
}
