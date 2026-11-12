const requiredChecks = [
  { workflow: "CI", name: "Verify" },
  { workflow: "CI", name: "Domain mutation" },
  { workflow: "CI", name: "Browser smoke" },
  { workflow: "CI", name: "Compose smoke" },
  { workflow: "CI", name: "Gitleaks" },
  { workflow: "CodeQL", name: "Analyze JavaScript and TypeScript" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireSuccessfulCheck(
  checks: readonly unknown[],
  { workflow, name }: { workflow: string; name: string },
): void {
  const label = workflow + " / " + name;
  const matches = checks.filter(
    (check) =>
      isRecord(check) &&
      check.__typename === "CheckRun" &&
      check.workflowName === workflow &&
      check.name === name,
  );
  if (matches.length === 0) throw new Error("Missing check " + label);
  for (const check of matches) {
    if (!isRecord(check) || check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
      throw new Error(label + " must complete successfully");
    }
  }
}

export function requireCleanWorktree(status: string): void {
  if (status !== "")
    throw new Error("Local worktree is dirty. Commit your changes and rerun the gate.");
}

export function checkPr({
  head,
  worktreeStatus,
  pr,
}: {
  head: string;
  worktreeStatus: string;
  pr: unknown;
}): void {
  requireCleanWorktree(worktreeStatus);
  if (!isRecord(pr) || pr.state !== "OPEN") throw new Error("An open pull request is required");
  if (!/^[a-f0-9]{40}$/.test(head) || pr.headRefOid !== head) {
    throw new Error("Pull request head does not match local HEAD");
  }
  if (!Array.isArray(pr.statusCheckRollup)) throw new Error("Pull request checks are unavailable");

  for (const check of requiredChecks) requireSuccessfulCheck(pr.statusCheckRollup, check);
}
