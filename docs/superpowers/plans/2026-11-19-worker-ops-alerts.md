# Worker Operations Alerts Implementation Plan

> **For agentic workers:** Follow this plan with test-first changes. Keep all incident data synthetic.

**Goal:** Emit one PII-safe, idempotent alert when a worker job exhausts retries, and prove the path through a real Postgres worker run using an inspectable fake adapter.

**Design:** Add a narrow `OpsAlert` contract containing only a stable deduplication key, task identifier, attempt count and occurrence time. A fake adapter keeps an in-memory outbox and ignores duplicate keys. The worker's `job:failed` listener sends the sanitized event asynchronously and logs only adapter success/failure plus the safe job metadata already used by the worker. A test-only injected watchdog check makes one synthetic job fail; no public route can trigger it.

**Files:** `apps/worker/src/ops-alerts.ts` defines the contract/fake; `apps/worker/src/runtime.ts` accepts an optional test health check; `apps/worker/src/worker.ts` handles exhausted retry events; `apps/worker/test/queue.integration.test.ts` proves a synthetic incident reaches the fake once and omits payload/error content; `apps/worker/test/ops-alerts.test.ts` covers fake idempotency; `docs/SECURITY_REVIEW.md`, `docs/READINESS.md`, `docs/HUMAN_TODO.md`, and `docs/progress/lane-a.md` record evidence and provider setup.

### Tasks

1. Write and run the failing fake-adapter idempotency test; implement the minimal fake.
2. Write and run a failing worker integration test for an exhausted synthetic watchdog job; add a test-only health-check injection and safe failure-event handler.
3. Run focused worker tests, typecheck, lint, then `pnpm verify`; obtain an independent review; update readiness/security/human docs with what is proven and what still needs credentials.
4. Commit and push this slice; verify the pushed commit's GitHub checks.

**Review focus:** duplicate failure events do not produce duplicate alert keys; job payload and exception text never enter alerts or logs; test failure injection is not reachable by public requests; failed alert delivery does not swallow the worker failure.
