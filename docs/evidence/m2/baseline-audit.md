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

- [ ] **MER-01** The passing signup-to-approved browser journey now covers an application photo. The authenticated notice API reads and retires the durable record. Lane B still needs to prove the visible notice in an already-open admin console.
- [x] **MER-12** Lane A added the bounded CSV/XLSX import screen, template and error report. The production browser journey starts with an empty menu and proves retry after a committed apply, refresh failure, and duplicate-free reimport.
- [x] **MER-14** Production browser tests cover application, item, cover and logo photos. The Arabic/French profile matrix passed at 390px and 1280px in both themes. The worker and PostGIS tests cover private processing, variants and retries.
- [x] **M2-2** Migration 0022 provisions settings and feature flags. PostGIS verified the schema and existing tenant constraints.
- [x] **MER-15** The Arabic and French editor can create, edit and remove dated exceptions. The production stale-draft regression proves a sibling save cannot overwrite another tab’s exception.
- [x] **M2-10 preview** Production browser and PostGIS prove held items are absent and direct detail returns 404. A reviewed false positive appears after approval. Lane B still owns the repeat-review token UI.
- [x] **M2-12 seed** Two local seed runs produced twelve fictional Algiers restaurants with sixty bilingual items and twelve private synthetic photos.
- [x] **Gate wiring** The combined production onboarding and design commands passed when invoked directly, and the dedicated authorization matrix passed all 203 cases. The default CI trace remains scoped to the last closed milestone (M1).

- [ ] **MER-11** Handle whole-category price changes when a category has more than the 500 items allowed by the contract.

The first CodeQL run flagged two auth handlers and one pagination test fixture. See [M2 integration PR](https://github.com/Mahdi-Lalioui/delivery/pull/3).
