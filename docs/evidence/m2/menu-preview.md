# M2 customer menu preview evidence (ADM-04, §17.3)

Recorded 2026-11-13 by Claude, covering while Codex was out.

`pnpm test:e2e:auth --grep @menu-preview` passed the production-build journey in `e2e/auth-menu-preview.spec.ts` (5.7 s). An owner signs in, and the harness seeds an approved owner membership. Through the API, the owner creates a "Plats" category, an unflagged spicy item "Couscous aux légumes" / "كسكس بالخضر" at 850 DA, and "Bière pression", which the moderation matcher holds as `blocked_pending_review`. In French and then Arabic, the owner opens the menu builder and follows the **Aperçu client** / **معاينة الزبون** link to `/<locale>/merchant/<id>/menu/preview`. They see the restaurant name, the category, the listed item with its localized name and spicy tag, and no trace of the held item.

In each locale, the journey captures the matrix (light/dark × 390×844 / 1280×800). All 8 cases have zero axe WCAG A/AA/2.1/2.2 AA violations and no horizontal overflow. The captures show the Arabic page right to left, with the price shown as `850 دج`. [Lossless captures](menu-preview/), converted from the run's PNG attachments with the repository's Sharp 0.35.5.

The full authenticated suite (`pnpm test:e2e:auth`) passed 18/18 after the builder gained the preview link.

Server-side proof: `packages/db/test/menu-preview.integration.test.ts` (3) and `apps/api/test/admin-moderation.integration.test.ts` (2) run against PostGIS through `startApi`. A held item stays out of the preview until an audited approval, a rejected item stays out, archived items and other tenants' items never appear, and staff-only or foreign memberships get `not_found`. Letting `blocked_pending_review` and `rejected` through the SQL filter made all four preview assertions fail.

Not covered: 768×1024, 200% text, the pseudo-locale and a design-critic review. Photos and option groups are not in the preview yet (M2-6).
