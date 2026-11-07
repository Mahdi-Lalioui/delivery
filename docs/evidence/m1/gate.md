# M1 gate evidence

On 7 November 2026, `pnpm gate m1` exited 0 on the local M1 implementation with Docker Desktop and real PostGIS. GitHub Actions results will be added after the PR completes.

| Gate check | Result |
|---|---|
| `pnpm verify` | 50 tooling, 380 unit and 12 PostGIS integration tests passed. Production build, OpenAPI check, dependency boundaries and production dependency audit passed. The acceptance trace found 20/20 required IDs through M1. |
| `pnpm test:domain:coverage` | 196 domain tests passed with 99.26% lines (270/272) and 98.87% branches (352/356). [Coverage report](coverage-summary.json) |
| `pnpm test:mutation` | Stryker reported 92.65% against the 85% threshold. Its report separates surviving mutants, timeouts and mutation-induced runtime errors. [Mutation report](mutation-summary.json) |
| `pnpm test:properties` | Four seeded properties passed with 1,000 runs each. They check pricing against an independent integer oracle, order invariants across command sequences, search normalization idempotence and overnight opening boundaries. |

## Independent checks

- The prayer adapter matched 57 of 59 dates exactly and the other two within one minute. The reference uses USNO sunset and the published CRAAG three-minute adjustment. The geo and calendar suites also passed with host timezones UTC+14 and UTC−10. [Reference fixture](../../../packages/geo/test/fixtures/algiers-maghrib-2027.json)
- The reviewer reproduced and cleared P1 regressions for extra order event fields, stale versions after completion, direct JSX copy, and a scheduled slot at the current instant.
- Local generated cache files initially caused a mutation worker copy error and false dependency-scan violations. The Stryker sandbox and dependency scanner now exclude the generated pnpm store. The dependency rule rejecting a domain-to-database import still passes its regression test.
