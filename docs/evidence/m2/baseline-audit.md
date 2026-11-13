# M0–M2 integration audit

Scope: the committed M0, M1 and M2 snapshots, excluding the working import UI. M2 baseline: `88363b7`.

| Check | Result |
| --- | --- |
| M0 merged baseline `pnpm verify` | Pass, 106 unit and 12 integration tests |
| M0 merged baseline production browser smoke | Pass, 59 cases |
| M1 merged baseline `pnpm gate m1` | Pass, 400 unit and 12 integration tests, 99.15% domain branch coverage, 94.21% mutation score and 1,000-run property checks |
| M1 merged baseline `pnpm test:e2e --fail-on-flaky-tests` | Pass, 59 cases |
| M2 merged baseline `pnpm verify` | Pass, 1,246 unit and 155 PostGIS integration tests |
| M2 production browser suites | Pass, 59 foundation cases and 16 authenticated cases |
| M2 dedicated authorization command | Pass, 118 tests in the suites currently listed |
| M2 scoped acceptance trace | 35/37 IDs. Missing `MER-01` and `MER-14`. Import row validation accounts for `MER-12` in this trace. |

The follow-up fixes re-screen approved source text when duplicating an item. The PostGIS regression failed before the fix, and both menu item and moderation suites passed afterward (13/13).

## M2 gate work still open

- [ ] **MER-01** Extend the passing signup-to-approved browser journey to cover application photos and admin notice delivery before marking the bare ID covered. Application photos are rejected today, and the review notice has no consumer.
- [x] **MER-12** Finish the bounded CSV/XLSX import screen, template, error report and production browser journey. Done 2026-11-13, see [menu import evidence](menu-import.md).
- [ ] **MER-14** Register and prove the media worker, persisted ready variants, crop workflow and item attachment. The committed intake stops at preparing.
- [ ] **M2-2** Close the umbrella schema task. Tenant constraints and mixed-role tests exist. Settings and flags and the full media lifecycle are still open.
- [x] **MER-15** Add the web editor and production test for dated hours exceptions. Done 2026-11-13, see [hours evidence](hours.md).
- [ ] **M2-10** Prove the customer-facing preview. The committed test verifies the moderated item count in the authenticated onboarding checklist. 2026-11-13: the preview read, `GET /v1/merchants/:merchantId/menu/preview` and the PostGIS proof through `startApi` exist. The web page and browser journey are still open.
- [ ] **M2-12** Seed twelve fictional bilingual Algiers restaurants with synthetic imagery and `is_demo`.
- [ ] **Gate wiring** Run the tagged onboarding journey using the authenticated Playwright config. Register a real design-screen check. The dedicated authorization-matrix command now runs every `apps/api/test/*-http.test.ts` suite (2026-11-13: 14 files, 175 tests), and a tooling test fails if a route suite is left out. Complete missing 768px and pseudo-locale design evidence. The default CI trace remains scoped to the last closed milestone (M1).

- [ ] **MER-11** Handle whole-category price changes when a category has more than the 500 items allowed by the contract.

The first CodeQL run flagged two auth handlers and one pagination test fixture. See [M2 integration PR](https://github.com/Mahdi-Lalioui/delivery/pull/3).
