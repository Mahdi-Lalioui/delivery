# M1 gate evidence

On 7 November 2026, `pnpm gate m1` exited 0 on clean M1 PR head `1d43c1cf279e30e2771a4fd216df23ab884473e6` with Docker Desktop and real PostGIS. The repository PR check also confirmed all required GitHub Actions passed for that exact commit. [M1 PR](https://github.com/Mahdi-Lalioui/delivery/pull/2)

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

## GitHub Actions on the implementation commit

- Verify passed, including the four domain checks and a 92.65% Stryker score. [Job](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42388266528/job/128450190525)
- Browser smoke passed. [Job](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42388266528/job/128450190204)
- Compose smoke passed. [Job](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42388266528/job/128450190438)
- Gitleaks passed. [Job](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42388266528/job/128450190489)
- CodeQL JavaScript and TypeScript passed. [Job](https://github.com/Mahdi-Lalioui/delivery/actions/runs/42388266460/job/128450190016)

PR #2 is based on the still-open M0 branch so its diff contains only M1 changes. [M0 PR](https://github.com/Mahdi-Lalioui/delivery/pull/1)
