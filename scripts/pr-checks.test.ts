import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPr } from "./pr-checks.ts";

const head = "0123456789abcdef0123456789abcdef01234567";

function passingPr() {
  const checkNames = [
    ["CI", "Verify"],
    ["CI", "Domain mutation"],
    ["CI", "Browser smoke"],
    ["CI", "Compose smoke"],
    ["CI", "Gitleaks"],
    ["CodeQL", "Analyze JavaScript and TypeScript"],
  ];
  return {
    headRefOid: head,
    state: "OPEN",
    statusCheckRollup: checkNames.map(([workflowName, name]) => ({
      __typename: "CheckRun",
      workflowName,
      name,
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/example/delivery/actions/runs/123/job/456",
      startedAt: "2026-11-07T14:00:00Z",
      completedAt: "2026-11-07T14:01:00Z",
    })),
  };
}

void test("[M0-11] accepts completed successful checks on an open PR for the clean local HEAD", () => {
  assert.doesNotThrow(() => {
    checkPr({ head, worktreeStatus: "", pr: passingPr() });
  });
});

void test("[M0-11] rejects an exact-head PR when the local worktree is dirty", () => {
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "?? untracked.ts\n", pr: passingPr() });
  }, /worktree is dirty/i);
});

void test("[M0-11] rejects a successful PR for a different commit", () => {
  const pr = { ...passingPr(), headRefOid: "abcdef0123456789abcdef0123456789abcdef01" };
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /does not match local HEAD/);
});

void test("[M0-11] rejects a closed PR", () => {
  const pr = { ...passingPr(), state: "CLOSED" };
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /open pull request/i);
});

void test("[M0-11] rejects a required check with a different workflow or check name", () => {
  const pr = passingPr();
  pr.statusCheckRollup = pr.statusCheckRollup.map((check) =>
    check.name === "Verify" ? { ...check, workflowName: "Another workflow" } : check,
  );
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /Missing check CI \/ Verify/);

  pr.statusCheckRollup = pr.statusCheckRollup.map((check) =>
    check.name === "Verify" ? { ...check, workflowName: "CI", name: "Verify alternate" } : check,
  );
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /Missing check CI \/ Verify/);
});

void test("[M0-11] rejects a missing security check", () => {
  const pr = passingPr();
  pr.statusCheckRollup = pr.statusCheckRollup.filter((check) => check.workflowName !== "CodeQL");
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /Missing check CodeQL/);
});

for (const [status, conclusion] of [
  ["QUEUED", ""],
  ["IN_PROGRESS", "SUCCESS"],
  ["COMPLETED", "SKIPPED"],
  ["COMPLETED", "NEUTRAL"],
  ["COMPLETED", "FAILURE"],
  ["COMPLETED", "CANCELLED"],
] as const) {
  void test(`[M0-11] rejects a required check with status ${status} and conclusion ${conclusion || "pending"}`, () => {
    const pr = passingPr();
    pr.statusCheckRollup = pr.statusCheckRollup.map((check) =>
      check.name === "Browser smoke" ? { ...check, status, conclusion } : check,
    );
    assert.throws(() => {
      checkPr({ head, worktreeStatus: "", pr });
    }, /CI \/ Browser smoke must complete successfully/);
  });
}

void test("[M0-11] rejects a duplicate required check if either matching run failed", () => {
  const pr = passingPr();
  const verify = pr.statusCheckRollup.find((check) => check.name === "Verify");
  assert.ok(verify);
  pr.statusCheckRollup.push({ ...verify, conclusion: "FAILURE" });
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /CI \/ Verify/);
});

void test("[M0-11] rejects a lookalike commit status in place of a GitHub Actions check run", () => {
  const pr = passingPr();
  pr.statusCheckRollup = pr.statusCheckRollup.map((check) =>
    check.name === "Gitleaks" ? { ...check, __typename: "StatusContext" } : check,
  );
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr });
  }, /Missing check CI \/ Gitleaks/);
});

void test("[M0-11] rejects unavailable GitHub check evidence", () => {
  for (const pr of [undefined, null, {}, { ...passingPr(), statusCheckRollup: null }]) {
    assert.throws(() => {
      checkPr({ head, worktreeStatus: "", pr });
    });
  }
});

void test("[M0-11] requires the standalone domain mutation job to pass", () => {
  const pr = passingPr();
  const withoutMutation = pr.statusCheckRollup.filter(({ name }) => name !== "Domain mutation");
  assert.throws(() => {
    checkPr({ head, worktreeStatus: "", pr: { ...pr, statusCheckRollup: withoutMutation } });
  }, /Missing check CI \/ Domain mutation/u);
});
