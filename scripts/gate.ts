import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { getGateChecks, resolveGate, runGate } from "./gate-plan.ts";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const commands: ReadonlyMap<string, readonly string[]> = new Map([
  ["verify", ["verify"]],
  ["verify:full", ["verify:full"]],
  ["tokens:contrast", ["--dir", "packages/tokens", "test:contrast"]],
  ["ci:pr", ["exec", "node", "scripts/check-pr.ts"]],
]);

const pnpmNames = new Set(["pnpm", "pnpm-native", "pnpm.cjs", "pnpm.exe"]);

function requirePnpmPath(): string {
  const executable = process.env.npm_execpath;
  if (
    !executable ||
    process.env.npm_lifecycle_event !== "gate" ||
    !isAbsolute(executable) ||
    !pnpmNames.has(basename(executable))
  ) {
    throw new Error("Run the milestone with pnpm gate.");
  }
  return executable;
}

function runCheck(check: string, milestone: string, pnpm: string): number {
  const testTag = /^e2e:(@[a-z0-9-]+)$/.exec(check)?.[1];
  const args = testTag ? ["test:e2e", "--grep", testTag] : commands.get(check);
  if (!args) {
    process.stderr.write("Gate check is not available: " + check + "\n");
    return 127;
  }
  process.stdout.write("[" + milestone + "] " + check + "\n");
  const result = spawnSync(pnpm, args, {
    cwd: workspace,
    env: { ...process.env, TRACE_MILESTONE: milestone },
    stdio: "inherit",
  });
  if (result.error) process.stderr.write(result.error.message + "\n");
  if (result.error && "code" in result.error && result.error.code === "ENOENT") return 127;
  return result.status ?? 1;
}

try {
  const [name, ...extra] = process.argv.slice(2);
  if (!name || extra.length)
    throw new Error("Usage: pnpm gate <m0…m12 | release-web | release-mobile>");
  const milestone = resolveGate(name);
  const plan = readFileSync(new URL("../docs/PLAN.md", import.meta.url), "utf8");
  const checks = getGateChecks(plan, milestone);
  const pnpm = requirePnpmPath();
  process.exitCode = runGate(checks, (check) => runCheck(check, milestone, pnpm));
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
