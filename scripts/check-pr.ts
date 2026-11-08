import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkPr, requireCleanWorktree } from "./pr-checks.ts";

const workspace = fileURLToPath(new URL("../", import.meta.url));

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 30_000,
  });
  if (result.error) throw new Error("Unable to run " + command + ": " + result.error.message);
  if (result.status !== 0) throw new Error(command + " could not provide PR gate evidence");
  return result.stdout;
}

function getWorktreeStatus(): string {
  return run("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--ignore-submodules=none",
  ]);
}

function getHead(): string {
  return run("git", ["rev-parse", "--verify", "HEAD"]).trim();
}

try {
  const head = getHead();
  requireCleanWorktree(getWorktreeStatus());

  const result = run("gh", ["pr", "view", "--json", "headRefOid,state,statusCheckRollup"]);
  const pr: unknown = JSON.parse(result);
  if (getHead() !== head) throw new Error("Local HEAD changed while reading the pull request");
  checkPr({ head, worktreeStatus: getWorktreeStatus(), pr });
  process.stdout.write("Required pull request checks passed for " + head + "\n");
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
