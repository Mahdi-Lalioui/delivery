# AWID final rerun preflight

Inventory checked against `589d23ce`. The final rerun is pending. Start once
the open prerequisites in [READINESS](../../READINESS.md) pass. Use a clean
checkout of the release candidate and synthetic fixtures for local drills.
Record the commit, environment, commands, exit codes and evidence links.

## Existing commands

Run from the repository root, with the test Postgres/PostGIS service available.

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm test:authz
pnpm test:e2e
pnpm test:e2e:auth --workers=2 --fail-on-flaky-tests
pnpm test:preview
pnpm test:visual
pnpm test:a11y
pnpm test:mutation
bash infra/deploy/test-restore-drill.sh
gitleaks git --redact --no-banner --log-opts="-m --all --full-history"
```

`pnpm verify` includes the production dependency advisory gate
(`pnpm audit --prod --audit-level high`). Rebuild and scan the release
images per the [image scan evidence](trivy-images-nov18.md). Repeat the
[connected k6 pilot](k6/connected-pilot.md) and the [delivery, pickup,
restart, replay and timer drills](local-operations.md) on the disposable
production Compose stack. Use the existing HTTPS smoke entry point with
the rehearsal origins and trusted local CA:

```sh
bash infra/deploy/production-smoke.sh "$API_ORIGIN" "$WEB_ORIGIN" "$WWW_ORIGIN" "$CA_CERTIFICATE"
```

## Gate gaps

- `pnpm verify:full` exists but calls `pnpm test:lighthouse`, which has no
  root script. The [release report](../../RELEASE_REPORT.md) records the
  unresolved SEO threshold for intentionally private Checkout and Tracking.
- `pnpm gate m9` and its alias `pnpm gate release-web` exist. The
  [gate registry](../../PLAN.md#gate-definitions-for-pnpm-gate) starts M9
  with `verify:full`. The gate runner maps `drill:restore` but has no
  mappings for `k6:all`, `zap:staging`, `smoke:staging` or
  `checklist:release`.
- Record each completed command as component evidence. Aggregate
  `verify:full` and M9 results remain pending until their gates run in full.
