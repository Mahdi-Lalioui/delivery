# PLAN — living execution plan

This is the execution plan both builders keep up to date. Follow the two lane sequences in AGENTS.md §0 through 15 November. From 16 November run the gates in order. A milestone is done only when `pnpm gate mN` exits 0 and its evidence sits in `docs/evidence/mN/`.

Refine each milestone's task list when you start it. Split tasks so each fits one work-loop cycle (AGENTS.md §3). Keep task IDs stable (`M4-7`).

## November build and hardening schedule

| Date              | Lane A target                                                         | Lane B sequence                                   |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------- |
| Mon 9 Nov         | Finish M2 and M3                                                      | M7 first                                          |
| Wed 11 Nov        | M4                                                                    | M6 after M7                                       |
| Thu 12 Nov        | M5                                                                    | M8 after M6                                       |
| Sat 14 Nov        | M11 partner app                                                       | M10 after M8                                      |
| Sun 15 Nov        | Integrate both lanes and reach feature completion                     | Integrate both lanes and reach feature completion |
| Mon 16–Sun 22 Nov | Gates M0–M11, fixes, audits, staging, restore drill and deployability | Same hardening and release checklist              |

Start from green M0, M1 and M2 snapshots merged into `main` in order. Push both lanes from that baseline. Lane A publishes the admin/billing, ratings, promotions and scheduling contracts first. Merge lane A then lane B each evening, with full verification and end-to-end tests green on `main`. Rebase both lanes every morning. Resume from `docs/progress/lane-a.md` or `docs/progress/lane-b.md` after an account switch.

## Pilot and launch dependencies (Africa/Algiers)

| What                                                           | Target                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pilot with 3–5 real restaurants (Mahdi)                        | 11–20 Jan                                                                                               |
| Public soft launch in Algiers                                  | 21–25 Jan                                                                                               |
| Ramadan expected to start (±1 day)                             | **~8 Feb 2027**. The web app must be stable before then.                                                |
| M10 customer app: TestFlight + Google Play closed test started | by **15 Jan** (a new personal Play account needs **12 testers opted in for 14 days** before production) |
| M12 store release                                              | February                                                                                                |

The PWA is the Ramadan launch vehicle. The native apps follow as fast as store rules allow.

## Gate basics (every gate also runs these)

- `pnpm verify` is green.
- `pnpm trace` shows every acceptance ID of the milestone covered.
- The `reviewer` reports no open P0/P1 on the milestone diff.
- PROGRESS has evidence for every task.

---

## M0 — Foundations

**Goal:** a monorepo where every quality check runs locally and in CI before any feature exists.

- [x] M0-1 Verify and pin SPEC §19 in DECISIONS D-001. Record the registry or official release and compatibility constraints for each pin. Keep tools for later milestones out of the M0 dependency graph. Verify the selected Node and pnpm executables run together before locking dependencies.
- [x] M0-2 Create `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml` and `packages/config/` for strict TypeScript, type-aware ESLint, Prettier and Vitest. First prove the configuration rejects invalid types, unsafe code, broken boundaries and under-threshold coverage. Check a frozen install and the shared tooling against the first real packages.
- [x] M0-3 Implement the AGENTS §2 commands and `scripts/{trace,gate}`. Tests first for missing/unknown IDs, incidental ID mentions, malformed gate definitions, aliases and failed or unavailable commands. Trace lists future acceptance IDs as pending and fails for missing current or prior IDs. Web release traces through M9. Mobile release traces all IDs. Run the gate list without evaluating Markdown as shell code.
- [x] M0-4 Add `infra/compose.dev.yml` with PostgreSQL 18/PostGIS, Martin and OSRM and a root `compose.yml` entry point. Verify health checks, synthetic development data and a route using the Algiers extract. Add inspectable fake SMS and push outboxes and test that they are confined to development and test builds.
- [x] M0-5 Create `packages/db/{src,migrations,test}` for Drizzle, postgres.js and the extension migration. Integration tests query PostGIS, `pg_trgm`, `unaccent` and `uuidv7()` in real PostgreSQL. Run two test files in parallel and prove isolation, repeatable migrations and guarded cleanup of test databases cloned from a migrated template.
- [x] M0-6 Commit the `packages/contracts` health, readiness and RFC 9457 response shapes first. In `apps/api`, test route contracts, bad environment, DB/job readiness, request IDs, log redaction, rate limits and a deny-by-default route inventory. Require the full role matrix to cover each route. Start the production artifact and prove the separately composed test routes return 404.
- [x] M0-7 Create `apps/worker` with a typed Graphile Worker job registry. Test on Postgres that duplicate execution yields one committed effect and a failed transaction can retry. Readiness verifies the job schema.
- [x] M0-8 Implement `apps/web` locale routes, document direction, message catalogs, CSP nonce proxy and the localized `/[locale]/dev/design` guide. Wire the DESIGN §3–5 token source in `packages/tokens` and the four self-hosted font families. First write route, direction, nonce, font and theme assertions. Use an optimized test build for the guide and verify it is absent from the public production build.
- [x] M0-9 Recompute all DESIGN §3.3 WCAG contrast pairs from the canonical palette. Run the test for both themes and prove a deliberately low-contrast fixture is rejected.
- [x] M0-10 Configure Playwright mobile Chromium, mobile WebKit and desktop Chromium against an optimized build. Cover I18N-01/I18N-07 with the ar/fr × light/dark matrix, locale metadata, an expanded pseudo-locale, screenshots after `document.fonts.ready`, animations disabled and axe. Exercise the 360 px floor without claiming device certification.
- [x] M0-11 Add GitHub Actions for format, lint, types, unit, real PostGIS integration, optimized browser tests, audit, gitleaks and CodeQL. Install the pre-commit checks. Prove CI runs on the M0 PR and use the exact checks for that PR head as the gate evidence.
- [x] M0-12 Document every validated variable in `.env.example`; add `docs/runbooks/README.md` with setup, checks and recovery commands and a `docs/PRIVACY.md` skeleton. Have QA reproduce setup from a clean checkout and record remaining human-owned steps.

Run red → green → `pnpm verify` → reviewer → commit and push for each implementation slice. The empty remote gets a starter baseline on `main` so M0 can use a reviewable PR. Workspace commands and gate checks under construction remain explicitly pending until their real suites are runnable. Use local evidence and CI results to distinguish an unavailable dependency from a failed assertion.

**Gate m0:**

- `pnpm verify` and `pnpm test:e2e --grep @smoke` (the style guide renders in ar/fr, light/dark, and axe is clean);
- CI green on the PR;
- contrast test passes.

## M1 — Domain core (pure, heavily tested)

**Goal:** the rules that move money and orders are proven before any screen uses them.

- [ ] M1-1 `Dzd` type, money arithmetic, pricing (MON-01…07, MON-10) with fast-check properties.
- [ ] M1-2 Order state machine (§3, ORD-01…04, ORD-12) as pure `transition(order, command, actor, now)`.
- [ ] M1-3 Hours, slots and Ramadan offsets (HRS-01…03), with the reference prayer-time table for Algiers Feb–Mar 2027.
- [ ] M1-4 Search `normalize` + `skeleton` + synonyms (SRCH-01…03), with the golden query list as unit tests.
- [ ] M1-5 Delivery-fee and ETA formulas (MON-04, GEO-04), and the zone-check helper.
- [ ] M1-6 i18n formatters: money, phone, dates, plurals (I18N-02…06).
- [ ] M1-7 StrykerJS on `packages/domain`.

**Gate m1:** domain coverage ≥ 95/90, mutation score ≥ 85%, all property tests pass with 1 000 runs each.

## M2 — Restaurant onboarding and menu builder (web)

**Goal:** a restaurant can sign up, get approved and build a beautiful menu in minutes.

- [ ] M2-1 Auth: OTP + sessions + roles (AUTH-01…09, CUS-10).
- [ ] M2-2 Schema: merchants, members, categories, items, option groups, media, price history, settings, flags, audit log.
- [ ] M2-3 Signup (MER-01) and a minimal admin approval page (ADM-03, first slice).
- [ ] M2-4 Onboarding checklist (MER-02).
- [ ] M2-5 Menu builder (MER-09, MER-10), including keyboard reordering.
- [ ] M2-6 Media pipeline (MER-14, §16).
- [ ] M2-7 Bulk price change with undo (MER-11).
- [ ] M2-8 CSV/XLSX import (MER-12).
- [ ] M2-9 Hours and Ramadan rules UI (MER-15, MER-16).
- [ ] M2-10 Prohibited-goods moderation (§17.3, ADM-04).
- [ ] M2-11 Staff roles (MER-23).
- [ ] M2-12 Seed: 12 **fictional** demo restaurants in Algiers communes with realistic menus in ar/fr and realistic Algiers prices, marked `is_demo`.

**Gate m2:**

- e2e `@merchant-onboarding`: signup → admin approve → build a 10-item menu with options and photos → bulk price change → import CSV → shown correctly in the preview;
- authz matrix covers the new routes;
- design QA screenshots for the builder.

## M3 — Discovery, search and restaurant pages (customer web)

**Goal:** browsing feels instant and beautiful; search understands Algiers.

- [ ] M3-1 Location onboarding and service areas (CUS-02, GEO-01, GEO-02, address search, commune list).
- [ ] M3-2 Feed endpoint and home, browsable without an account (CUS-01, CUS-03, CUS-04).
- [ ] M3-3 Search index, jobs, endpoint and UI (SRCH-04…06, CUS-05, CUS-06).
- [ ] M3-4 Restaurant page and item sheet (CUS-07, CUS-08), with ETag caching.
- [ ] M3-5 Cart (CUS-09) with persistence.
- [ ] M3-6 Link-in-bio pages with OG images (CUS-27). SEO: metadata, `hreflang`, sitemap, schema.org Restaurant/Menu.
- [ ] M3-7 PWA basics (CUS-25), low-data mode (CUS-26, GEO-10), and route bundle budgets in CI (NFR-02).

**Gate m3:**

- e2e `@discovery` in ar and fr: set location → search `chawarma` and `شاورما` → open a restaurant → add items with options → cart persists after reload;
- the search benchmark (SRCH-06) passes;
- Lighthouse budgets (NFR-01/02) on home and restaurant pages.

## M4 — Checkout, orders and the live board

**Goal:** the core loop works end to end and cannot lose or duplicate an order.

- [ ] M4-1 Addresses (CUS-11) with voice notes and plus codes (GEO-08).
- [ ] M4-2 Quotes and pricing endpoint (MON-08, MON-09, CUS-16, CUS-17).
- [ ] M4-3 Three-step checkout (CUS-12…15), plus the restaurant's pay-at-door settings (MER-18).
- [ ] M4-4 Order placement and transitions in the API (§3, ORD-01…11), with concurrency integration tests.
- [ ] M4-5 Realtime WebSocket with replay (RT-01…04).
- [ ] M4-6 Restaurant live board (MER-03…07): sound gate, wake lock, offline replay, ticket printing.
- [ ] M4-7 Timers and escalation jobs (MER-05, ORD-07, JOB-01…04).
- [ ] M4-8 Notifications: web push + SMS adapters and fakes, the event matrix and board sound (SPEC §8, NOT-01…05, CUS-20).
- [ ] M4-9 Customer tracking without the map yet (CUS-18 timeline part), and cancel (CUS-19).
- [ ] M4-10 Test order (MER-25).

**Gate m4:**

- e2e `@order-core` with customer + restaurant contexts: place cash order with change → board rings → accept → ready → (pickup) collect. Also reject, expire with fake clock, customer cancel, network cut on the board followed by replay;
- the double-submit test proves one order;
- the chaos test (JOB-04) passes.

## M5 — Maps, drivers and live tracking

**Goal:** precise addresses and live tracking that feel as good as the best apps.

- [ ] M5-1 Tiles pipeline (GEO-05): `infra/scripts/tiles-extract.sh` (Protomaps extract for northern Algeria) → Martin. Style builder from tokens (DESIGN §9). Arabic labels with the RTL plugin.
- [ ] M5-2 OSRM pipeline (`infra/scripts/osrm-prepare.sh`, Geofabrik Algeria extract) with circuit breaker and fallback (GEO-03).
- [ ] M5-3 Zones UI: draw/radius and fees (MER-17). Serviceability endpoint.
- [ ] M5-4 Driver invites and management (MER-08). Courier PWA (COU-01…07).
- [ ] M5-5 Position intake, validation and broadcast (GEO-06, RT-04).
- [ ] M5-6 Tracking map with smoothing, 3D tilt and live ETA (CUS-18 map, GEO-04, GEO-07).
- [ ] M5-7 Delivery code and fallbacks (ORD-09, COU-05, COU-06). Share link (CUS-18).
- [ ] M5-8 Optional Nominatim reverse geocoding (GEO-09).

**Gate m5:**

- e2e `@delivery-golden-path` with all four actors: customer orders → restaurant accepts and assigns a driver → driver picks up → mocked geolocation moves along a real OSRM route → the customer sees the marker move and the ETA drop → driver enters the code → delivered → customer rates;
- an RTL tracking screenshot passes;
- k6 position-ingest test meets NFR-03.

## M6 — Retention and delight

**Goal:** reasons to come back.

- [ ] M6-1 Ratings and replies (CUS-22, MER-20).
- [ ] M6-2 Favourites (CUS-23), order history, receipts and reorder (CUS-21).
- [ ] M6-3 Promotions (MER-19, CUS-16 completion).
- [ ] M6-4 Scheduling, the Iftar slot and countdown (CUS-13, HRS-02, HRS-03, `ramadan_mode`).
- [ ] M6-5 Order for someone else (CUS-15 completion).
- [ ] M6-6 Busy mode (MER-06).
- [ ] M6-7 Shareables: QR codes and posters (MER-24).
- [ ] M6-8 Analytics for restaurants (MER-21) and first-party events.
- [ ] M6-9 Menu photo import behind its flag (MER-13), using the fake LLM adapter in tests.

**Gate m6:** e2e `@retention` (reorder with a changed price, promo, scheduled iftar order with fake clock, rating + reply), plus design QA for all new screens.

## M7 — Admin, billing and operations

**Goal:** Mahdi can run the business from one place.

- [ ] M7-1 Admin console (ADM-01…10) with TOTP.
- [ ] M7-2 Subscriptions, invoices (PDF), payments, reminders and suspension (BIL-01…06, MER-22).
- [ ] M7-3 Settings, flags and kill switches (ADM-08). Maintenance banner.
- [ ] M7-4 Profile, privacy export/delete and help (CUS-24); `docs/PRIVACY.md` retention table; retention jobs.
- [ ] M7-5 Ops watchdog alerts (Telegram/email adapters), metrics endpoint, error tracking hooks (NFR-07).

**Gate m7:** e2e `@admin-billing`: fake clock runs through trial → invoice → overdue → suspended (hidden from customers) → payment recorded → reactivated. Plus account deletion and anonymisation, and the admin audit log.

## M8 — Signature design and polish

**Goal:** the "wow". Every screen meets DESIGN.md, and the signature moments exist.

- [ ] M8-1 Landing `/[locale]` with the "Casbah at golden hour" hero (DESIGN §8.1), poster fallback generated in CI, capability gating.
- [ ] M8-2 Restaurant pitch page `/[locale]/restaurants` with the calculator (DESIGN §7.1-8) and signup CTA.
- [ ] M8-3 Signature moments 2–7 (DESIGN §7.1), each with reduced-motion versions.
- [ ] M8-4 Full design QA pass (DESIGN §14) on every screen, with all fixes applied.
- [ ] M8-5 Accessibility pass: keyboard-only and screen-reader runs of the order path (CUS-28, NFR-05), with fixes.
- [ ] M8-6 Performance pass: budgets, image audit, font audit, bundle splitting.

**Gate m8:**

- `pnpm verify:full`;
- Lighthouse budgets on landing, home, restaurant, checkout and tracking;
- the hero at ≥ 50 fps in the Playwright perf probe (desktop) and correct fallback behaviour (low-end emulation shows the poster);
- design-critic report with zero open items.

## M9 — Hardening and production readiness → web release candidate

**Goal:** safe to put real restaurants and real customers on it.

- [ ] M9-1 Security audit: authz matrix review, OWASP ZAP baseline on staging, headers, upload fuzzing, rate-limit tests, secret scan, dependency review. Fix all findings.
- [ ] M9-2 Load tests (NFR-03) with fixes; EXPLAIN review of the top 20 queries.
- [ ] M9-3 Chaos: kill the worker, restart the DB, OSRM down, tiles down, SMS provider failing. Correct degradation and alerts.
- [ ] M9-4 Production compose, Caddy, backups and the restore drill (NFR-04); runbooks (SPEC §20).
- [ ] M9-5 Staging deploy pipeline with post-deploy smoke tests. Production pipeline ready with manual approval; Mahdi provides the server (HUMAN_TODO).
- [ ] M9-6 Legal pages: terms for customers and restaurants, privacy (drafts marked "to be reviewed by a lawyer"), the restaurant subscription contract (1 page).
- [ ] M9-7 `docs/RELEASE_CHECKLIST.md` — every item checked with evidence.

**Gate m9 = gate release-web:**

- `pnpm verify:full`, k6 thresholds and the ZAP report with no high findings;
- the restore drill passes;
- staging smoke tests pass;
- RELEASE_CHECKLIST complete.

Tag `v1.0.0-rc.1`.

## M10 — Customer app (iOS and Android)

**Goal:** the customer web experience, native and smoother.

- [ ] M10-1 `apps/mobile` with Expo SDK (latest), Expo Router, `packages/ui-native` from the same tokens. Fonts and RTL (`I18nManager`) handled correctly, with locale switching without a broken layout.
- [ ] M10-2 Every CUS-* feature (MOB-01), sharing contracts, domain and i18n.
- [ ] M10-3 Native maps (MapLibre RN) with the same style and tracking smoothness.
- [ ] M10-4 Push, OTP autofill, deep/universal links (MOB-03…05).
- [ ] M10-5 Motion with Reanimated 4, haptics, and the tagine moment (DESIGN §8.3).
- [ ] M10-6 EAS profiles, EAS Update, CI builds (MOB-06).
- [ ] M10-7 Maestro flows for the main journeys, plus performance checks (MOB-08).

**Gate m10:**

- Maestro `@customer` suite green on the Android emulator (low-end profile), and on the iOS simulator if available;
- Jest coverage ≥ 70%;
- 60 fps scroll on the restaurant page in the performance profile;
- a preview build installed on Mahdi's phone (HUMAN_TODO).

## M11 — Partner app (restaurant + driver)

- [ ] M11-1 `apps/partner`: restaurant mode (board, accept/reject, ready, sold-out, quick menu edits) with a loud notification channel.
- [ ] M11-2 Driver mode with background location (MOB-02), disclosure screens and battery-aware intervals.
- [ ] M11-3 Maestro suites for both modes.

**Gate m11:** Maestro `@partner` green; a 30-min background-location soak test on the emulator with no crash or leak.

## M12 — Store release

- [ ] M12-1 Store assets: icons, splash, screenshots generated from Maestro runs, descriptions in ar/fr/en.
- [ ] M12-2 Store compliance (MOB-07): privacy labels and data-safety answers (`docs/store/`), account-deletion URL, review notes (demo account, how to test).
- [ ] M12-3 Production builds, EAS Submit. Mahdi runs the human steps in HUMAN_TODO (accounts, testers, review answers).

**Gate release-mobile:** both apps approved (or in review) with evidence in PROGRESS.

---

## Phase 2 backlog — do not start without Mahdi's go-ahead

Platform riders and dispatch · groceries · online card payments with per-restaurant Chargily keys · next cities · group orders · loyalty (SPEC §22).

## Surprises and discoveries

(append here: date, what you found, what changed in the plan)

## Gate definitions for `pnpm gate`

Keep this machine-readable list in sync with the sections above:

```
m0: verify, e2e:@smoke, tokens:contrast, ci:pr
m1: verify, coverage:domain, mutation:domain, property:1000
m2: verify, e2e:@merchant-onboarding, authz:matrix, design:screens
m3: verify, e2e:@discovery, bench:search, lighthouse:home,restaurant
m4: verify, e2e:@order-core, int:@concurrency, chaos:worker
m5: verify, e2e:@delivery-golden-path, visual:@tracking-rtl, k6:positions
m6: verify, e2e:@retention, design:screens
m7: verify, e2e:@admin-billing, e2e:@privacy
m8: verify:full, lighthouse:all, perf:hero, design:report-clean
m9: verify:full, k6:all, zap:staging, drill:restore, smoke:staging, checklist:release
m10: verify, maestro:@customer, jest:coverage, perf:mobile
m11: verify, maestro:@partner, soak:background-location
m12: verify, store:submission
```
