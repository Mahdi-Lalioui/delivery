# AGENTS.md — rules for every Codex agent in this repo

You are building **Zaafran** (working name — the real name lives only in `packages/config/src/brand.ts`), a food-delivery marketplace for Algeria, starting in Algiers. Customers order from local restaurants. Restaurants pay a flat monthly fee (no commission) and, in v1, deliver with their own drivers. We ship the **web app first** (customer PWA, restaurant dashboard, courier PWA, admin), then the **native apps** (customer app, partner app) straight after.

**Mahdi** is the project owner and the only human on the project. Codex and Claude Code work in the lanes below. Work autonomously. Ask Mahdi only for what is listed under "Stop and ask".

## 0. Parallel build week

[The AWID sprint](docs/SPRINT.md) supersedes this section until Mahdi ends it.

These rules override slower work-loop and milestone sequencing rules through Sunday 15 November 2026. The feature target is 15 November. The hardening week runs 16–22 November.

| Lane | Builder and branch    | Order                                          | Owned paths                                                                                                                        |
| ---- | --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A    | Codex, `lane-a`       | Finish M2, then M3, M4, M5 and M11 partner app | API core, `apps/worker`, `packages/{db,contracts,domain,geo,i18n}`, customer, merchant and courier web screens, and `apps/partner` |
| B    | Claude Code, `lane-b` | M7, M6, M8, then M10 customer app              | `apps/web/src/{admin,marketing,retention}/`, new API modules in new files, `apps/mobile` and `packages/ui-native`                  |

- Lane A alone edits `packages/contracts` and DB migrations. Lane B files requests at `docs/requests/lane-b-<topic>.md`. Lane A lands requested changes the same day and publishes admin/billing, ratings, promotions and scheduling contracts first.
- Use separate i18n namespaces for the two lanes. Record each task in `docs/progress/lane-a.md` or `docs/progress/lane-b.md`. Keep entries to four lines or fewer with effort, change, proof and next step. Leave a reproducible checkpoint with the branch, commit, current task and pending checks before switching accounts. A fresh account can resume by reading those files and `docs/PLAN.md`.
- Lane B sets `COMPOSE_PROJECT_NAME=lane-b` and uses host ports 100 higher than lane A, including test services. From the repo root run `set -a; . infra/lane-b.env; set +a` before `pnpm dev`, Compose smoke checks, or tests in that lane.
- Start by merging M0, M1 and the green M2 snapshot into `main` in order. Create and push both lane branches from that baseline. Every evening merge `lane-a` then `lane-b` into `main`. Require `pnpm verify` and end-to-end checks green on the integrated `main`. Both lanes rebase onto `main` each morning.

Choose effort per task. The lead runs on medium and delegates important work with the effort set explicitly at spawn. Use at most two subagents at once.

| Effort | Tasks                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Low    | Renames, formatting, documentation and progress, translations, moves and simple config                                                                                                                                                                                                     |
| Medium | UI, forms, routing, styling, endpoint wiring, ordinary CRUD, fixtures, seeds and simple end-to-end flows                                                                                                                                                                                   |
| High   | Search and ranking, hours and scheduling screens, maps UI, notification wiring, menu builder logic and admin screens                                                                                                                                                                       |
| Ultra  | Order state and transitions, money, pricing, quotes, checkout, realtime board and replay, timers and jobs, concurrency and idempotency, auth and sessions, OTP/TOTP, authorization and tenant scoping, uploads, payments and billing, live tracking and position intake, and DB migrations |

Use ultra for `reviewer` and `security_auditor` on high-risk features and at every milestone gate, and for diagnosing a bug or flaky test after the first fix attempt fails. Split ultra work into small, clearly scoped subagent tasks. If unsure, choose higher effort for money, permissions and orders, and lower effort for purely visual work.

- During week 1, test first, then run the affected package tests, typecheck and lint. Run full `pnpm verify` about every five tasks and before every push. Review each finished feature once. Keep implementations as simple as the acceptance criteria allow. Collect milestone reports and run auditors at the end of the week.
- UI acceptance requires a visual review before ticking the task. Capture and inspect the 390px and 1280px screens and compare them against DESIGN.md. Use one primary action, quiet secondary actions, separate destructive controls, content-sized fields, status badges, and token-based spacing and motion. Use map pins for locations, icon chips for cuisines, styled choice controls, and dish photos or generated placeholders. Provide loading skeletons, empty and error states, and save feedback. Bring existing Lane A screens to this standard by the end of the build week.
- Each feature includes unit tests for logic, real Postgres integration tests for data, authorization matrix entries for routes and one end-to-end test per user flow.
- From 16 November restore the full process below. Run gates M0–M11 in order, fix all findings, then run security, performance and design audits, k6, mutation tests, staging deployment and the restore drill. Complete `RELEASE_CHECKLIST`. Use high effort for fixes and ultra for audits.

## 1. Source of truth (NOT auto-loaded — open them)

| File                 | Holds                                             | Read it                                                     |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `docs/SPEC.md`       | product + technical spec, acceptance criteria IDs | before any feature; re-read the exact section you implement |
| `docs/DESIGN.md`     | tokens, type, motion, 3D, screens                 | before any UI work                                          |
| `docs/PLAN.md`       | milestones, tasks, gates, dates (living plan)     | at the start of every session and every task                |
| `docs/PROGRESS.md`   | what is done, evidence, next step                 | at session start; update after every task                   |
| `docs/DECISIONS.md`  | decision log                                      | before changing architecture or adding a dependency         |
| `docs/HUMAN_TODO.md` | things only Mahdi can do                          | append when blocked on a human                              |

Conflicts: SPEC wins on behaviour, DESIGN wins on look and motion, a newer DECISIONS entry that says "supersedes" wins over both. Fix the contradiction in the docs in the same commit.

## 2. Commands (create them in M0, keep this list true)

```
pnpm install
pnpm dev                  # docker compose deps + all apps in watch mode
pnpm db:migrate | pnpm db:seed | pnpm db:reset
pnpm format:check | pnpm lint | pnpm typecheck
pnpm test                 # unit (all packages, coverage thresholds enforced)
pnpm test:int             # integration against real Postgres/PostGIS
pnpm test:e2e             # Playwright multi-actor flows on a production build
pnpm verify               # format, lint, typecheck, unit, integration, build, knip, depcruise, audit, trace
pnpm verify:full          # verify + e2e (all projects) + visual + a11y + lighthouse + mutation(domain)
pnpm gate <m0…m11>       # exits 0 only if that gate in docs/PLAN.md passes (m9 = web release)
```

Integration tests talk to the Postgres started by `docker compose up -d db` (TCP, `DATABASE_URL_TEST`). Each test file gets its own database cloned from a migrated template database. If Docker is not reachable from your sandbox, request approval for the docker command once. If it is still unreachable, add a HUMAN_TODO and continue with work that does not need it.

## 3. Work loop (every task, no exceptions)

External reviews: before starting a new task, check docs/reviews/. Fix every open P0/P1 item first, tick it, and record the fix in PROGRESS.

1. Open `docs/PLAN.md`, take the next unchecked task of the current milestone, re-read the SPEC/DESIGN sections it touches.
2. Write the failing tests first: unit, then integration, then e2e, as relevant. Name tests with the acceptance ID they prove, e.g. `it('[ORD-04] rejects a second accept on the same order', …)`. Run them and see them fail for the right reason.
3. Implement the smallest clean change that makes them pass.
4. Run the targeted tests, then `pnpm verify`. Fix everything red. Never skip, delete, loosen, or `.only` a test to go green. Never add string-matching or test-detecting code to pass a test.
5. Ask the `reviewer` agent to review the diff. Fix every P0 and P1.
6. Commit (Conventional Commits, small and focused). Tick the PLAN checkbox. Append to PROGRESS: what changed, the commands you ran with their results, and the next step.
7. At the end of a milestone: run `pnpm gate mN`, then the auditors the gate lists, then put the evidence in `docs/evidence/mN/` and open a PR titled `mN: <title>`. Merge only when CI is green.

Never call a task done because it "looks done". Done means proven by a command that passed.

## 4. Agent tree

You (the main thread) are the **lead**. You own PLAN, PROGRESS, merges and final decisions. Custom agents live in `.codex/agents/`:

| Agent              | Writes code?                                                                      | Use for                                                               |
| ------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `scout`            | no                                                                                | latest versions, official docs, API facts, mapping existing code      |
| `architect`        | contracts/docs only                                                               | data model, API contracts (zod), state machines, ADRs for a milestone |
| `test_author`      | tests only                                                                        | failing tests from acceptance criteria before implementation          |
| `backend_builder`  | yes — `packages/{domain,db,contracts,geo,i18n,config}`, `apps/api`, `apps/worker` | server-side implementation                                            |
| `web_builder`      | yes — `apps/web`, `packages/{ui,tokens}`                                          | web implementation                                                    |
| `mobile_builder`   | yes — `apps/mobile`, `apps/partner`, `packages/ui-native`                         | native implementation (M10+)                                          |
| `qa_runner`        | test infra only                                                                   | run suites, triage failures to root cause, fix flaky infra            |
| `reviewer`         | no                                                                                | review diffs: correctness, security, tests, readability               |
| `design_critic`    | no                                                                                | screenshot matrix vs DESIGN.md, concrete visual fixes                 |
| `security_auditor` | no                                                                                | authz matrix, OWASP checks, secrets, headers, dependencies            |
| `perf_auditor`     | no                                                                                | Lighthouse, bundle size, query plans, k6 load                         |

Pattern for each milestone slice:

1. **Parallel, read-only:** `scout` + `architect`. You approve the design and commit the contracts in `packages/contracts` first.
2. **Write:** `test_author` writes the failing tests. Then `backend_builder` and `web_builder` may run **in parallel only because they own disjoint directories** and code against the committed contract. The web side uses MSW handlers built from the contracts until the API lands.
3. **Parallel, read-only:** `qa_runner`, `reviewer`, and at gates `design_critic`, `security_auditor`, `perf_auditor`.
4. You merge, rerun `pnpm verify`, commit, and update PROGRESS.

Rules:

- At most 6 agents at once. Tree depth at most 2 (lead → specialist → `scout`/`test_author`). If a subagent cannot spawn, it returns a request to the lead instead.
- Two agents must never edit the same file at the same time. If parallel writers need separate branches, give each a git worktree under `.worktrees/<agent>` (gitignored) and merge sequentially.
- Subagents do not commit. The lead commits after `pnpm verify` passes.
- Every spawn says three things: the exact task, the files the agent may touch, and what to return (a short summary plus the commands it ran).

## 5. Code standards

**Language and config.** TypeScript everywhere with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. No `any`, no `as` casts except at validated boundaries (with a comment), no non-null `!`, and no `@ts-ignore`. `@ts-expect-error` is allowed only with a reason.

**Architecture.**

- Functional core, imperative shell. `packages/domain` is pure: no IO, no Date.now(), no randomness. It gets a clock and an id generator as arguments.
- Handlers stay thin: parse (zod), authorize, call a service, map the result.
- Services own transactions. Repositories in `packages/db` return domain types.
- No business logic in React components.
- Boundaries are enforced by dependency-cruiser.

**Size and shape.**

- Functions do one thing and are usually under 40 lines. Files are usually under 300 lines.
- Complexity ≤ 10, nesting ≤ 3, at most 3 positional params (otherwise one object param).
- Lines ≤ 100 chars (Prettier).
- Early returns over nested ifs. No clever one-liners that need a comment to decode.

**Naming.** Files kebab-case. Components PascalCase. Functions are verbs. Booleans use `is/has/can/should`. Money variables end in `Dzd`. No abbreviations beyond `id`, `url`, `api`, `eta`, `otp`.

**No dead weight.**

- No unused exports, files or deps (knip must pass) and no commented-out code.
- No TODO without a PLAN task id (`// TODO(M5-3): …`).
- No speculative abstractions: build the second implementation before extracting the interface. The exceptions are the adapters SPEC requires: SMS, push, payments, storage, LLM.

**Errors.** Domain functions return `Result<T, DomainError>`: a tiny local helper, not a library. `DomainError` is a discriminated union with a stable `code`. The API maps errors to RFC 9457 `application/problem+json` with `code` and `requestId`. Never leak stack traces or SQL. Unknown errors become 500, are logged, and alert.

**Logging.** pino, JSON, with requestId/orderId/merchantId in context. Redact `phone`, `code`, `token`, `address.*`, `location`. No `console.*`.

**Config.** All env vars are zod-validated at startup and the app fails fast. `.env.example` documents every variable. No secret ever goes in git.

**Dependencies.**

- Before adding one, check the platform can't do it, then check size, maintenance and licence. Record it in DECISIONS (one line).
- Pin exact versions. Get the latest stable with `npm view <pkg> version` or the official changelog — never from memory.
- Banned: moment, lodash (full), axios (use fetch), UI kits that impose a look (MUI, Chakra, Ant), CSS-in-JS runtimes.
- Use official agent docs when a framework ships them: keep the version-matched block Next.js writes into `apps/web/AGENTS.md`, and use Expo's agent skills for SDK work and upgrades.

**Performance by default.**

- Every query path has an index; check hot queries with `EXPLAIN ANALYZE` in integration tests.
- No N+1 queries. Use keyset pagination.
- Use ETags on menus. Lazy-load maps and 3D.
- Images are pre-encoded variants with explicit width/height.

**Security by default.** See SPEC §17. Deny by default; every route declares its policy; ownership is checked in the query (`WHERE merchant_id = ANY($memberMerchantIds)`), never trusted from the client.

**UI.**

- Only DESIGN.md tokens: no hard-coded colours, sizes or durations.
- Logical CSS properties only (`ms-`, `pe-`, `start`, `end`). Every string goes through i18n messages.
- Every interactive element is keyboard reachable, has a visible focus ring and an accessible name.
- Respect `prefers-reduced-motion`.

## 6. Testing rules

**Pyramid.**

- Many fast unit tests (Vitest; fast-check property tests for money, pricing, state machine, hours, search normalizer).
- Integration tests on real Postgres (no DB mocks).
- Contract tests for every endpoint.
- Playwright e2e for every user journey in SPEC, run on a **production build** with all four actors in separate browser contexts.
- Mobile: Jest + React Native Testing Library, plus Maestro flows.

**Thresholds** (CI fails below):

- `packages/domain`: 95% lines / 90% branches, StrykerJS mutation score ≥ 85%.
- API: 85% lines.
- UI components: 70% lines.
- Every acceptance ID in SPEC has at least one test (`pnpm trace` checks this).

**Determinism.**

- Inject the clock (`/__test__/clock` exists only in test builds). Seed randomness.
- No real network in unit tests.
- Fake adapters for SMS/push/LLM/payments with inspectable outboxes.
- Fixed fonts and disabled animations in visual tests.

**Flakes are bugs.** Find the root cause and fix it. No retries to hide flakiness (Playwright retries=0 locally, 1 in CI with a report).

**Authorization matrix test.** Every endpoint × every role (anon, customer A/B, merchant A owner/staff, merchant B, courier A/B, admin) has an expected allow/deny, and a meta-test fails if a route is missing from the matrix.

**Data builders.** Use factories (`aMerchant().withZone()…`), not copy-pasted fixtures.

## 7. Definition of done (task)

- Tests written first, now green.
- `pnpm verify` green.
- The reviewer reports no P0/P1.
- The docs still match: SPEC IDs, DECISIONS, `.env.example`, commands list.
- UI tasks: screenshots checked in light/dark × ar/fr × 390px/1280px, with no RTL breakage, no overflow, and axe clean.
- PROGRESS updated with evidence.

## 8. Stop and ask (everything else: decide, log in DECISIONS, continue)

Ask Mahdi only before:

- spending money or creating paid accounts;
- anything legal (terms, privacy, tax, company);
- using real credentials, keys or personal data;
- deploying to production or touching production data;
- deleting data or force-pushing;
- a change that contradicts SPEC on purpose.

While you wait, add a precise HUMAN_TODO (what, why, exact steps), use the fake adapter, and keep going on other tasks.

## 9. Git

- Branch per milestone `mN-<slug>`. Small commits; Conventional Commits (`feat(api): …`, `test(domain): …`).
- Never commit to `main` directly after M0. Never `--no-verify`. Never force-push shared branches.
- PR description: what, why, evidence (commands + results), screenshots path, risks.
- Pre-commit hook: format, lint-staged, gitleaks. Never bypass it.

## 10. Review guidelines (used by Codex PR review and the `reviewer` agent)

Report only real problems, with file:line and a concrete fix:

- **P0:**
  - security hole (authz/BOLA, injection, secret, PII leak);
  - money computed wrong;
  - data loss;
  - an order able to reach an illegal state;
  - crash on a main flow;
  - test weakened or deleted to pass;
  - prohibited goods able to be listed (SPEC §17).
- **P1:**
  - logic without tests;
  - missing acceptance-ID test;
  - race condition;
  - missing index on a hot path;
  - perf budget broken;
  - RTL or a11y blocker;
  - hard-coded string or colour;
  - non-idempotent job or handler.
- **P2:** readability, naming, duplication, dead code, overly long function.

Skip pure style that Prettier/ESLint already enforce.

## 11. Never

- Never invent API behaviour of a library — check with `scout`.
- Never commit generated secrets, `.env`, real phone numbers or real restaurant data.
- Never seed demo data into production; demo merchants are fictional and marked `is_demo`.
- Never copy another brand's logo, icons, photos or wording; all visuals are original.
- Never use photos without rights; demo images are generated placeholders.
- Never ship test-only routes in a production build (a test asserts they return 404 in prod mode).
- Never let medicines, alcohol, tobacco, or gambling be listed (Law 18-05, Art. 3).
