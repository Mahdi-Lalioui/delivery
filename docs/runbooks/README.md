# Development runbook

## First run

Install the Node and pnpm versions in the workspace manifest, Docker with Compose v5.7.0, Git, and Gitleaks v8.30.1. The pinned PostGIS image runs on Linux amd64. Use Rosetta-backed emulation on an Apple silicon Docker host.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Set AUTH_OTP_KEY and AUTH_TOTP_KEY in .env using two independent openssl rand -hex 32 values.
pnpm hooks:install
pnpm exec playwright install chromium webkit
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Visit the development web app at `http://127.0.0.1:3000` so the browser origin matches `AUTH_PUBLIC_ORIGIN`. The web listener defaults to port 3000. The API listens on loopback port 3002. PostgreSQL, Martin, and OSRM expose ports 5432, 3001, and 5000 on loopback. The Compose tiles and routing fixtures are for development. Martin serves a synthetic archive, and OSRM routes over a clipped Algiers road network with attribution in `infra/fixtures/algiers-roads.LICENSE`.

`/healthz` indicates the API is accepting requests. `/readyz` also requires PostgreSQL and the Graphile migration ledger. The development API exposes fake SMS, email and push inboxes at `/__dev__/outbox` on loopback. Production uses the regular web and API builds. The optimized design profile and integration routes are local verification tools.

## Verify

```sh
docker compose up -d --wait db
pnpm verify
pnpm test:e2e --grep @smoke
pnpm trace --through m0
pnpm gate m0
```

Use GitHub CLI authentication for the PR check in `pnpm gate m0`. It checks the current commit against the PR's required successful runs. On Linux CI, Playwright needs `pnpm exec playwright install --with-deps chromium webkit`.

Run `bash infra/verify-dev-compose.sh` to exercise the three real services together. Integration suites clone a migrated template into one database per test file. The harness requires PostgreSQL 18 on the local test database URL. Let teardown complete so the clones are dropped.

The M0 gate runs the workspace, browser smoke, contrast and PR checks. The full release suite also needs the domain mutation targets from M1 and route-level Lighthouse budgets from M3.

## Diagnose local failures

- If PostGIS is unavailable, run `docker compose ps db` and `docker compose logs db`. Confirm port 5432 belongs to this stack and amd64 emulation is available on arm64.
- If `/readyz` is 503 while `/healthz` is 200, confirm the database is healthy, then run `pnpm db:migrate` to apply the development migrations and Graphile schema.
- If a browser is missing, run `pnpm exec playwright install chromium webkit`. If using a custom `PLAYWRIGHT_BROWSERS_PATH`, use the same value during install and testing.
- If the design guide is 404, start the explicit design profile with `pnpm --filter @zaafran/web build:design` and `pnpm --filter @zaafran/web start:design`.
- To rebuild a disposable local development database, stop processes using it, run `pnpm db:reset --confirm`, then run `pnpm db:migrate`. Reset discards `zaafran_dev` data and refuses other database targets. Seed currently applies the development baseline. Restaurant fixtures start in M2.
