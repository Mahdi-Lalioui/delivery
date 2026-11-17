# M2 gate run — local (2026-11-17)

Tree: `39d1b4f` on `m2-merchant-onboarding`, Docker Desktop PostGIS, Node v26.13.0, pnpm 12.18.0. Run by Claude while covering for Codex.

| Check | Command | Result |
| --- | --- | --- |
| Gate | `pnpm gate m2` | Exit 0 |
| └ verify | (gate step) | Pass: 1,488 unit tests in 161 files and 206 PostGIS integration tests in 43 files; format, lint, typecheck, build, OpenAPI, knip, depcruise, audit (one moderate, below `high`), trace |
| └ `e2e:@merchant-onboarding` | `pnpm test:e2e:auth --grep @merchant-onboarding` | 1 passed (10.4 s), production build |
| └ `authz:matrix` | `pnpm test:authz` | 200 tests in 18 files passed |
| └ `design:screens` | `pnpm test:design` | 7 passed (13.8 s) |
| Authenticated journeys | `pnpm test:e2e:auth` | 23 passed (20.8 s), production build, 0 flaky |
| Acceptance trace | `pnpm trace --through m2` | 37/37 required IDs covered |

## Still open before the M2 PR

- **Real demo seed.** `pnpm db:seed` (twelve demo restaurants, D-022, and their generated photos, D-023) has only been proven on freshly migrated test clones. The shared `zaafran_dev` has schema drift from another worktree (see HUMAN_TODO) and needs Mahdi's go-ahead for `pnpm db:reset --confirm`.
- **Auditors.** The design critic's theme × locale × viewport review of the builder screens and the security auditor's pass, as AGENTS §3.7 lists them. Their reports go in this directory.
- **PR.** Open `m2: merchant onboarding` once the auditors report no P0/P1, and record the CI run here.

## Design spot check (not the auditor pass)

I looked at two committed screenshots: `bulk-price/bulk-price-ar-dark-390x844.webp` and `menu-preview/menu-preview-ar-light-390.webp`. RTL alignment, Arabic shaping, prices in `دج` and dark-theme contrast look correct. Two P2 notes for the design critic:

- The item cards in the builder show the availability twice: "متاح" as a plain line and again as the select's value. Check whether the line should be a visually hidden label.
- Checkbox and radio accents are inconsistent. `--color-info` is used in `apps/web/src/merchant/components/merchant.css:129` and `apps/web/src/merchant-onboarding/components/merchant-onboarding.css:94`; `--color-primary` is used in `menu-option-group/components/option-group.css:165` and `menu-item/components/menu-item.css:256`. Pick one token for all form-control accents.
