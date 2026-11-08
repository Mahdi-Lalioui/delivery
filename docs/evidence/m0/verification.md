# M0 local verification

## Workspace and database

| Command | Observed |
|---|---|
| `pnpm install --frozen-lockfile` | Exit 0 with Node 26.13.0 and pnpm 12.18.0 |
| `pnpm verify` | Exit 0 on Docker Desktop with 47 tooling tests, 102 unit tests and 12 real PostgreSQL integration tests |
| API and web component line coverage | 85.84% API and 76.47% web components |
| Generated OpenAPI | Exact regenerated schema matched `docs/openapi.json` |
| Dependency checks | Knip clean, no dependency-cruiser violations, no high or critical production audit advisories |
| Acceptance trace | Four of four M0 IDs covered. 157 later IDs remain pending |

The API integration process returned 404 for the test clock, reset, test inbox and dev inbox. Readiness returned 503 before the worker migrations and with the application effect ledger missing. It returned 200 after both schemas were available.

## Browser and design

`pnpm test:e2e --grep @smoke` exited 0 with 59 passed, zero skipped and zero flaky results. The production home and optimized design guide passed axe and overflow assertions in all 32 matrix cases. Chromium and WebKit verified local fonts, localized metadata, CSP nonces, and ordinary production 404s for the guide. The three pseudo-locale checks ran at 360 px.

The [35 lossless WebPs](screenshots/) match the browser captures pixel for pixel. They cover Arabic and French, light and dark, at 390×844 on both mobile engines, 768×1024 on tablet Chromium, and 1280×800 on desktop Chromium. The design critic found no required fixes. Live keyboard checks verified focus order, visible rings, skip links, and control sizes. Chromium's 200% text-scale probe at 360 px produced no horizontal overflow for Arabic, French, or the pseudo-locale.

## Review

The reviewer reproduced acceptance tags credited from disabled tests, authorization running after an early response, readiness with an incomplete application schema, simultaneous migration failure, and the resolver running ahead of rate limiting. Each received a failing regression before the fix. The final reviewer reported no remaining P0/P1 findings.

`actionlint` and shell syntax checks passed. An isolated hook test proved staged formatting and linting, rejection of a synthetic credential, and output redaction.
