# Lane B progress

- 2026-11-08 · Low · Recorded lane B ownership and integration rules. Start M7 on `lane-b` and request shared contracts or migrations in `docs/requests/`.
- 2026-11-08 · Ultra · M7-2 pure billing planner `apps/api/src/billing-schedule.ts` (BIL-02/03/04/06) + request `docs/requests/lane-b-billing.md`.
  Proof: `vitest run apps/api/test/billing-schedule.test.ts` 14/14, eslint, api typecheck, knip clean. `pnpm verify` green (lane-b db :5532).
  Next: admin billing screens on MSW, then settings/flags request.
- 2026-11-08 · High · External review: billing contract already published (lane-a 9cbab96, cherry-picked unchanged). Admin billing screen `/[locale]/admin/billing` on MSW mocks of that contract (invoice issued/paid/void, transfer `pending_confirmation`).
  Request `docs/requests/lane-b-billing.md` rewritten to ask only for the migration and routes. msw 3.0.3 logged as D-B01. Added `/admin/billing` to the admin list in shared `components/site-shell.tsx` (2 lines).
  Proof: `vitest run apps/web/test/admin-billing*` 7/7; full `pnpm verify` before push. Next: merchant billing (MER-22) screen, invoice PDF, settings screen.
- 2026-11-08 · High · MER-22 merchant billing `/[locale]/merchant/[id]/billing` + `/ar/…`: plan, due/past-due/suspended banners, invoice PDF links, CCP/BaridiMob proof upload → `pending_confirmation`, on MSW.
  Lives in `apps/web/src/admin/billing/` (lane B path); added `/merchant/${id}/billing` to shared `site-shell.tsx`. Proof-media paths updated in the request.
  Reviewer P1s fixed (stable idempotency keys, amount + tenant echo, upload expiry). Proof: billing web tests 24/24, `pnpm verify` green. Next: invoice PDF generator (API), billing settings screen, `@admin-billing` e2e once routes land.
- 2026-11-08 · Ultra · BIL-04 dependency-free invoice PDF writer `apps/api/src/invoice-pdf.ts` (escaping, xref offsets, amount guard). BIL-01/ADM-08 settings screen `/[locale]/admin/billing/settings` on MSW.
  Proof: `vitest run apps/api/test/invoice-pdf.test.ts` 6/6, `apps/web/test/billing-settings*` 6/6, `pnpm verify` green.
  Next: M6 screens on lane A's ratings/promotions/scheduling contracts; wire PDF + planner into API routes when lane A lands the billing migration.
- 2026-11-08 · High · M6-1 ratings on lane A's ratings contract: customer `/[locale]/orders/[id]/rating` (food/delivery stars, 24 h lock, reply shown) and merchant `/[locale]/merchant/[id]/reviews` (star filter, reply, report). MSW mocks; request `docs/requests/lane-b-ratings.md`.
  Proof: `vitest run apps/web/test/ratings*` 10/10, `pnpm verify` green. Next: M6-3 promotions, M6-4 scheduling.
- 2026-11-08 · High · M6-3 promotions editor `/[locale]/merchant/[id]/promotions`: code/automatic, percent+cap/fixed/free delivery, conditions, stats, live worked example priced by `@zaafran/domain/pricing` (web now depends on domain). MSW; request `docs/requests/lane-b-promotions.md`.
  Proof: `vitest run apps/web/test/promotion*` 10/10, `pnpm verify` green. Gap: weekly day/hour conditions. Next: M6-4 scheduling + iftar countdown.
