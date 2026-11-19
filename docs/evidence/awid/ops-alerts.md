# Worker operations-alert evidence

**Date:** 19 November 2026  
**Environment:** isolated integration database cloned from local Postgres 18/PostGIS; synthetic watchdog job only.

The fake adapter deduplicates stable keys and exposes an in-memory outbox. The
Resend adapter test verifies destination and idempotency key, omits job payload
and exception text, and confirms task identifiers are HTML-escaped. A real
Graphile worker run injects a synthetic watchdog failure with one allowed
attempt; `job:failed` emits exactly one safe alert and no job-effect receipt.
The test removes its own terminal fixture from Graphile Worker's private jobs
table in `finally`, so following queue tests remain isolated.

Commands run:

```sh
pnpm exec vitest run --coverage.enabled=false apps/worker/test/ops-alerts.test.ts --reporter=verbose
pnpm --filter @zaafran/worker typecheck
pnpm exec eslint apps/worker/src/command.ts apps/worker/src/runtime.ts apps/worker/src/worker.ts apps/worker/src/ops-alerts.ts apps/worker/test/ops-alerts.test.ts apps/worker/test/queue.integration.test.ts
pnpm exec vitest run --config vitest.integration.config.ts apps/worker/test/queue.integration.test.ts --reporter=verbose
```

**Results:** 3/3 alert unit tests, worker typecheck and scoped ESLint passed;
all 8/8 worker queue integration tests passed against Postgres. Graphile emits
`job:failed` only after `attempts >= max_attempts` (verified in the pinned
0.18.0 installed worker source). External Resend delivery was not attempted;
configure `OPS_ALERT_EMAIL` and confirm the provider path before launch.

**Limits:** This proves worker failure notifications and the fake adapter only.
It does not provide application error tracking, durable retries of failed alert
delivery, or evidence of a real email reaching the monitored inbox. The
readiness checkbox therefore remains open.
