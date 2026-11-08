# PROGRESS

Newest entry first. One entry per task. Evidence = the commands you ran and their result, not opinions.

## Template

### YYYY-MM-DD HH:MM — <task id> <title>
- **Changed:** <files / areas>
- **Evidence:** `<command>` → <result, e.g. "312 passed, 0 failed, coverage 96.1/91.4">
- **Reviewer:** <"no P0/P1" or the fixes applied>
- **Next:** <next task id>
- **Needs Mahdi:** <none / HUMAN_TODO item>

---

### 2026-11-07 19:03 GMT — M0 external P1 API log privacy

- **Changed** — Redact `phone`, `code`, `token`, `address`, and `location` at every depth after Pino serialization. Emit only the sanitized JSON, including when a later field shadows a sensitive child binding. The non-personal listener URL is logged as `listenAddress`.
- **Evidence** — The new logger tests reproduced nested, string and shadowed-binding leaks. All four passed after the fix. `pnpm verify` exited 0 with 47 tooling tests, 106 unit tests, 12 real PostGIS integration tests and all four M0 acceptance IDs. The production integration test found the renamed listener and verified live health, readiness and excluded debug routes.
- **Reviewer** — No P0/P1. Verified correlation IDs, serialized errors, child bindings and the live process diagnostic. [External review checklist](reviews/2026-11-07-m0.md)
- **Next** — Carry the fix into M1 and M2.
- **Needs Mahdi** — None.

### 2026-11-07 19:00 GMT — M1 external P1 order guard coverage

- **Changed** — Added 16 regressions for the ASAP timeout, scheduled time and release boundaries, pickup delivery-zone exemption, photo proof, failed code attempts, wait start, failure reason and call count. Pickup still requires the service area. The existing domain implementation passed every new case.
- **Evidence** — All 106 focused order transition tests passed. `pnpm gate m1` exited 0 with 50 tooling tests, 396 unit tests, 12 real PostGIS integration tests, 212 domain coverage cases, a 94.21% mutation score and four seeded 1,000-case properties.
- **Reviewer** — No P0/P1. Each new rejection reaches its intended guard with otherwise valid inputs. [External review checklist](reviews/2026-11-07-m1.md)
- **Next** — Carry the two review fixes into M2.
- **Needs Mahdi** — None.

### 2026-11-07 15:53 GMT — M1 gate passed

- **Evidence** — `pnpm gate m1` exited 0 on clean `1d43c1cf279e30e2771a4fd216df23ab884473e6`. `pnpm exec node scripts/check-pr.ts` confirmed all required checks passed for the same commit. GitHub Actions reproduced the 92.65% mutation score and all 20 required acceptance IDs. [Gate and job evidence](evidence/m1/gate.md) · [M1 PR](https://github.com/Mahdi-Lalioui/delivery/pull/2)
- **Reviewer** — No remaining P0/P1 after the lifecycle, schedule, copy lint and generated cache regressions passed.
- **Next** — M2 auth contracts, tenant-scoped persistence and merchant onboarding.
- **Needs Mahdi** — None for M1.

### 2026-11-07 15:48 GMT — M1-3 scheduling and local M1 gate

- **Changed** — Added Algiers civil hours, overnight and special-date precedence, busy pauses, 15-minute slots and Ramadan offsets, countdown and Iftar arrival. Extended order guard tests from the mutation review.
- **Evidence** — `pnpm gate m1` exited 0 on Docker Desktop. It ran 50 tooling, 380 unit, 12 real PostGIS integration and 196 domain coverage cases. Coverage reached 99.26% lines and 98.87% branches, Stryker scored 92.65%, four seeded properties ran 1,000 cases each, and the trace covered all 20 required IDs. [Local reports](evidence/m1/gate.md)
- **Reviewer** — Fixed offering an unusable current-time slot and closed historical calendar inputs outside the supported era. Verified the generated pnpm store exclusion and the workspace dependency rules. No remaining P0/P1.
- **Next** — Push the M1 snapshot and verify GitHub Actions on the PR head.
- **Needs Mahdi** — None.

### 2026-11-07 15:46 GMT — M1-4 search, M1-5 zone and M1-6 localization

- **Changed** — `637963d` added the cross-script search keys and 19 synonym groups, locale formatters and ICU messages, the geo adapter and polygon coverage, and shared CI checks for domain coverage, properties, and mutation analysis.
- **Evidence** — The staged snapshot passed `pnpm verify` with 49 tooling, 322 unit and 12 real PostGIS integration tests. Targeted checks proved 1,000 seeded normalization cases, all six Arabic ICU plural forms, polygon boundaries and holes, and all 59 Maghrib reference dates within one minute.
- **Reviewer** — Fixed missing JSX accessibility copy and visible submit, button and reset values, including uppercase and static template input types. The tooling regression and focused lint passed. No remaining P0/P1 in these changes.
- **Next** — Verify the complete M1 assembly with the scheduling and Ramadan rules.
- **Needs Mahdi** — None.

### 2026-11-07 15:39 GMT — M1-2 order lifecycle and M1-5 ETA

- **Changed** — `ee11491` added order state and scope checks, exact retries, event projection, delivery proof, deadlines and ETA ranges and refresh limits.
- **Evidence** — The staged snapshot passed `pnpm verify` with 48 tooling, 231 unit and 12 real PostGIS integration tests. The order and ETA suite passed 77 focused cases, including a seeded 1,000-run command-sequence property.
- **Reviewer** — Fixed and verified two P1 cases. Events now exclude extra action fields. A stale fresh command returns the version conflict even after a different command reached a terminal state. No remaining P0/P1.
- **Next** — Verify the search, locale, and geo packages together.
- **Needs Mahdi** — None.

### 2026-11-07 15:32 GMT — M1-1 integer pricing and cash change

- **Changed** — `914b97b` added branded DZD, integer line and option calculations, discount and fee rounding, minimum checks, cash change, and the M1 coverage and mutation command wiring.
- **Evidence** — The staged snapshot passed `pnpm verify` with 48 tooling, 154 unit and 12 real PostGIS integration tests. The domain pricing suite includes a seeded 1,000-run independent bigint oracle.
- **Reviewer** — No P0/P1. Added a regression for a negative adjusted line hidden by another positive line.
- **Next** — Prove the order transition and receipt contracts.
- **Needs Mahdi** — None.

### 2026-11-07 — M0 gate passed

- **Evidence** — `pnpm gate m0` exited 0 on Docker Desktop for clean PR head `acf1db5`. All five required Actions checks passed. The gate also reran 47 tooling, 102 unit, 12 real PostGIS integration, 59 browser and 59 contrast checks with 4/4 traced acceptance IDs. [Gate evidence](evidence/m0/gate.md) · [M0 PR](https://github.com/Mahdi-Lalioui/delivery/pull/1)
- **Clean checkout** — QA ran a frozen install from a fresh store, full verify and 59-case browser smoke at `acf1db5`. All exited 0 and the checkout stayed clean.
- **Review** — No open P0/P1. The design critic approved both screens at all required sizes. The audit reports one moderate tooling advisory within the high-severity gate.
- **Next** — M1 domain core, beginning with DZD arithmetic and pricing property tests.
- **Needs Mahdi** — None for M0. The Docker Desktop stack is healthy.

### 2026-11-07 15:10 GMT — M0 verified foundation commits

- **Changed** — Committed the health and problem contracts in `1f3d727` and the foundation implementation in `ce3adc6` on `m0-foundations`. The installed pre-commit hook ran formatting, ESLint and Gitleaks on both commits with zero leaks.
- **Evidence** — Fresh frozen install and `pnpm verify` exited 0 with 47 tooling, 102 unit and 12 real PostGIS integration tests, API line coverage 85.84%, web component line coverage 76.47%, and all 4 M0 acceptance IDs. See [verification evidence](evidence/m0/verification.md).
- **Evidence** — `pnpm test:e2e --grep @smoke` passed all 59 cases with 32 axe and overflow checks. The design critic found no fixes after reviewing the full matrix. The 35 WebPs match their source captures.
- **Evidence** — `pnpm dev` started web, API and worker together on Docker Desktop. HTTP probes returned health and readiness 200, the Arabic guide 200, and the loopback-only fake inbox. The development web listener was confirmed at `127.0.0.1:3000`. Watch processes were stopped after verification.
- **Reviewer** — No remaining P0/P1. The final rate-limit regression passed with 401, 401, 429 and only two actor resolutions.
- **Next** — Reproduce from a clean clone and verify all required GitHub Actions checks on the M0 PR head. Then run and record `pnpm gate m0`.

### 2026-11-07 15:03 GMT — M0 foundations verification on Docker Desktop

- **Evidence** — `pnpm verify` exited 0 with 47 tooling tests, 101 unit tests, 12 real PostGIS integration tests, 85.58% API line coverage, 76.47% web component line coverage, and 4/4 required M0 acceptance IDs traced. Formatting, lint, typecheck, production build, generated OpenAPI, Knip and dependency boundaries passed. The production audit found one moderate advisory in the tooling dependency minimatch and no high or critical advisories. [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- **Reviewer** — Real tests reproduced skipped trace registrations, auth hook ordering, missing application schema during readiness, and concurrent migrations. The fixes include runner-shared discovery, authorization ahead of route hooks, app and worker schema checks, and a transaction advisory lock around the migrator. A final rate-limit ordering regression now verifies the limiter runs before the actor resolver. Rerun full verify and review on the final snapshot.
- **Next** — Finish the full DESIGN §14 screenshot matrix, verify and commit the foundation snapshot, then check the exact PR head in GitHub Actions.

### 2026-11-07 15:02 GMT — M0-4 and M0-5 real Compose and database

- **Changed** — Added root Compose for PostGIS, Martin and OSRM, a synthetic PMTiles tile, an attributed Algiers road fixture, guarded development database commands and isolated test database clones.
- **Evidence** — `bash infra/verify-dev-compose.sh` exited 0 on Docker Desktop. PostgreSQL 18.6 and PostGIS 3.7.0 answered over TCP. Martin returned a 29-byte vector tile. OSRM found an 873.8 m route in 90.2 s. See [Compose and database evidence](evidence/m0/compose-database.md).
- **Evidence** — The concurrency regression reproduced SQLSTATE 23505 before the migrator lock. Afterward, 6/6 database integration tests passed and all four disposable databases were removed. The development migrate, seed and confirmed reset commands also passed on a disposable container.
- **Needs Mahdi** — Docker is ready. The temporary runtime was stopped and the Desktop Compose stack is running.

### 2026-11-07 14:58 GMT — M0-8 through M0-10 web shell and smoke tests

- **Changed** — Added ar/fr/en document shells, RTL, cookie and header negotiation, localized metadata, the isolated pseudo-locale and design guide, four self-hosted font families, CSP nonces, and token-generated light/dark themes. Ordinary production builds exclude the guide files.
- **Evidence** — The first browser run exposed missing localized titles and WebKit's missing Resource Timing entries despite successful font fetches. After adding metadata and using actual font responses plus loaded families, `pnpm test:e2e --grep @smoke` exited 0 with 39/39 cases, zero skips or flakes, and zero axe violations in the 12 guide matrix cases.
- **Evidence** — 58 DESIGN contrast pairs passed with a low-contrast rejection fixture. Six streamed React tests used the real translations and reached 76.47% web component line coverage.
- **Next** — DESIGN §14 also requires the public home and tablet images, 1280×800 desktop evidence, and compressed WebP output. The expanded matrix is being added.

### 2026-11-07 14:52 GMT — M0-6, M0-7 and M0-11 API, worker and CI

- **Changed** — Added health and problem response contracts and a generated OpenAPI document. The API has startup validation, request IDs, redacted logs, an explicit authorization matrix and rate limiting. Test endpoints and the fake outbox stay outside the production artifact. The worker uses Graphile revision 20 and a durable transactional effect ledger.
- **Evidence** — The built API returned 404 for all debug paths. Worker tests proved five real PostgreSQL cases, including duplicate concurrency, rollback and retry, a real queued watchdog and graceful acknowledgement. The compiled worker also handled SIGTERM while a job was active and exited 0.
- **Evidence** — Workflow syntax passed actionlint. The isolated pre-commit test blocked an ESLint violation and a synthetic credential with redaction. The PR gate rejects dirty worktrees, mismatched heads, skipped checks and missing security checks. GitHub Actions verification awaits the M0 PR.

### 2026-11-07 14:22 GMT — M0-1 to M0-3 workspace and gate checks

- **Changed** — D-001 records registry and upstream release pins. Added the pnpm/Turbo workspace, strict TypeScript, ESLint, Vitest, Prettier, dependency boundaries, root commands, acceptance trace, and milestone gate runner.
- **Evidence** — Node v26.13.0 and pnpm 12.18.0 ran together from the checksum-verified temporary Node installation. `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm knip` passed on the initial workspace. The four tooling checks and 25 gate and trace checks passed after the failing-first runs.
- **Reviewer** — Review found two P1s in M0-3. Regression tests now cover disabled or empty test registrations and missing mandatory gate checks. Also fixed TS versus TSX filename handling and the pnpm child process launch. Follow-up review pending.
- **Gate status** — `pnpm gate m0` invoked the full verification command and exited 1 at Vitest because app and package test files are still being built. `pnpm trace --through m0` exited 1 for the four missing M0 acceptance proofs and reported 157 future IDs.
- **Next** — Real Compose service fixtures, database migrations and isolated PostGIS integration tests.

### 2026-11-07 14:21 GMT — Isolated Docker and browser prerequisites

- **Changed** — Downloaded verified host tools into temporary directories and started an isolated Lima VM. The repository is mounted read-only in the guest.
- **Evidence** — `docker info` reported rootless Docker Engine 29.9.3 on the arm64 guest. `docker compose version` reported v5.7.0. Running `postgres --version` inside the digest-pinned amd64 PostGIS image via Rosetta exited 0 and reported PostgreSQL 18.6. See [runtime evidence](evidence/m0/environment.md).
- **Evidence** — `pnpm exec playwright install chromium webkit` and `pnpm exec playwright install --list` exited 0 with Playwright 1.65.0, Chromium revision 1254, and WebKit revision 2388 in the temporary browser cache. The test runner has not started a browser journey yet.
- **Needs Mahdi** — None for this session's runtime. A durable Docker installation remains listed in HUMAN_TODO.

### 2026-11-07 — Brief baseline and external-review rule

- **Changed:** Published the original brief on `main` in `ee27372` and switched to `m0-foundations` for implementation. Added the external-review rule to AGENTS §3. Refined M0 in PLAN.
- **Evidence:** Compared every staged file byte for byte against the starter archive and verified the index held exactly the 15 requested files, including all 11 role definitions. `git push -u origin main` exited 0. `git ls-remote --exit-code origin refs/heads/main` returned `ee27372`.
- **Evidence:** `git diff --check` passed. `pnpm verify` exited 1 because the bootstrap has no package manifest yet.
- **Reviewer:** No P0/P1. M0-4 now explicitly preserves the documented root `docker compose up -d db` entry point.
- **External reviews:** No review directory or open items existed at the branch setup check.
- **Next:** M0-1 version pins.

### 2026-11-07 14:02 GMT — M0 environment and repository preflight

- **Changed:** Cloned `Mahdi-Lalioui/delivery` into `delivery/` inside the supplied workspace and imported the source-of-truth files and specialist role definitions from the starter archive.
- **Evidence:** `git clone` exited 0 and reported an empty remote. `gh repo view` reported a public repository with no default branch ref. `gh auth status` succeeded through the host keyring outside the sandbox. Git is 2.54.0.
- **Evidence:** `node --version` reported v24.18.0 in the initial shell and v24.16.0 in the checkout shell. `pnpm --version` reported 11.25.0 and `corepack --version` 0.35.0. The scout will verify the current LTS patch before it is pinned.
- **Evidence:** `docker compose version` exited 127 in both shells. No supported container runtime or Postgres executable was found. The Playwright browser cache is absent and `pnpm exec playwright --version` exited 1 because the checkout has no package manifest yet. `df -h .` reported 801–802 GiB free on macOS arm64.
- **Next:** Refine M0 in PLAN, then verify and record the toolchain pins before adding dependencies.
- **Needs Mahdi:** See Docker setup in HUMAN_TODO. Continue with version research, workspace tooling and test authoring in parallel.

## Current status

- Milestone: M1 (gate passed, M2 next)
- Last green `pnpm verify`: 2026-11-07 on Docker Desktop with 380 unit tests
- Open HUMAN_TODO items: see docs/HUMAN_TODO.md
