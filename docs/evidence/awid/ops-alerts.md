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

## Telegram worker alerts

The worker can send the same terminal failure incident independently to email
and Telegram. Telegram receives a fixed summary with attempts and timestamp.
The adapter test passed using a fake receiver, including a provider refusal.
The Postgres queue suite passed 8 tests, including the terminal incident hook.
Live Telegram delivery and API error tracking remain open.

## API incident event

An unexpected API failure emits `api.request.failed` with the status,
registered route pattern, and request ID. A synthetic repository failure
verified that the exception text and concrete route value stay out of the
structured log. All eight API health tests passed. An external collector
still needs to ingest the event and prove delivery to operations.

A connected Postgres watchdog failure also exercised the production Telegram
adapter through an injected fetch receiver. The receiver saw exactly one
request with the expected alert body and no private job payload or exception
text. The queue suite passed 8/8. The receiver uses synthetic settings.

The connected watchdog incident now also exercises the production Resend
adapter through an injected fetch receiver. It recorded one request to the
synthetic operations inbox with the same incident idempotency key and no
job payload or exception text. The Postgres queue suite passed 8/8. Provider
delivery and external collector ingestion still require live configuration.

## Staging delivery verification

Use an isolated staging stack with synthetic data and approved operations
destinations. In the staging worker environment file, configure
`AUTH_RESEND_API_KEY`, `AUTH_RESEND_FROM`, and `OPS_ALERT_EMAIL` for email,
and `OPS_TELEGRAM_BOT_TOKEN` and `OPS_TELEGRAM_CHAT_ID` for Telegram. The
Resend sender must be verified and the bot must be able to post in the
monitored chat.

From the staging checkout, set `AWID_COMPOSE_PROJECT` to the deployed staging
project name and `AWID_STAGING_COMPOSE_ENV` to its Compose environment file.
Recreate the worker so it picks up the configured settings. Enqueue one
watchdog job with an empty synthetic payload. The watchdog requires
`checkId`, so validation fails before any job effect and the single allowed
attempt produces a terminal incident.

```sh
staging_compose() {
  docker compose --project-name "${AWID_COMPOSE_PROJECT:?Use the staging project name}" \
    --env-file "${AWID_STAGING_COMPOSE_ENV:?Use the staging Compose env file}" \
    -f infra/compose.production.yml "$@"
}

staging_compose up -d --no-deps --force-recreate --wait worker
```

Once Compose reports the worker healthy, run the following in the same shell.

```sh
job_key="ops-alert-smoke-$(date -u +%Y%m%dT%H%M%SZ)-$$"
staging_compose exec -T -u postgres db psql -X -v ON_ERROR_STOP=1 \
  -v "job_key=$job_key" -d awid <<'SQL'
SELECT id
FROM graphile_worker.add_job(
  'ops.watchdog', '{}'::json, max_attempts => 1, job_key => :'job_key'
);
SQL
```

Confirm one email and one Telegram message for the same UTC incident window.
Check that both show one attempt and exclude the payload and validation error.
Remove the keyed staging fixture after it reaches the terminal state. If the
cleanup returns zero rows, check the worker and the job state before retrying
cleanup. The guard requires Graphile Worker to have recorded the failure and
released the lock.

```sh
staging_compose exec -T -u postgres db psql -X -v ON_ERROR_STOP=1 \
  -v "job_key=$job_key" -d awid <<'SQL'
SELECT (graphile_worker.remove_job(key)).id AS removed_job_id
FROM graphile_worker.jobs
WHERE key = :'job_key'
  AND task_identifier = 'ops.watchdog'
  AND attempts = 1
  AND max_attempts = 1
  AND last_error IS NOT NULL
  AND locked_at IS NULL;
SQL
```

For API error tracking, connect the collector to the staging API container's
structured output and configure a notification for `event=api.request.failed`.
Use the repository-failure fixture in
[`apps/api/test/health.test.ts`](../../../apps/api/test/health.test.ts) as
the model for a temporary staging build. In that build, make the public
restaurant repository's `read` method throw a fixed synthetic error only
for the slug `synthetic-restaurant`. Keep the standard route and error
handler so the request exercises the real logging path. Send one request
with `AWID_STAGING_API_ORIGIN` set to the staging API origin.

```sh
curl --silent --show-error --dump-header - --output /dev/null \
  "${AWID_STAGING_API_ORIGIN:?Use the staging API origin}/v1/merchants/synthetic-restaurant"
```

Confirm HTTP 500 and use the response's `x-request-id` to match the event in
the collector and the resulting operations notification. Check the event for
`statusCode: 500` and the route pattern `/v1/merchants/:slug`. Confirm it contains
neither the concrete slug nor the exception text. Restore the approved
staging API image and verify readiness. Record the staging release SHA, UTC
time, worker job ID, API request ID, and observed outcomes here with provider
credentials and destination identifiers omitted.
