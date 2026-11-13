# M2 menu import evidence (MER-12)

`pnpm test:e2e:auth --grep @menu-import` passed the production-build journey in `e2e/auth-menu-import.spec.ts`.

1. The owner (`+213550000291`) signs in and opens a fictional category's item workspace.
2. For each of ar and fr, **Importer un menu** opens the panel. A two-row CSV is previewed: one valid row and one with the price `abc`. The panel shows the error table (row 3, price) and the row table, and **Confirmer l’import** stays disabled.
3. The owner previews and applies a valid one-row CSV. The receipt shows, and the API reads back exactly one item, "Chorba fictive" at 450 DA.
4. **Nouvel import** with the same file previews and applies again. The item list is unchanged, so the external key prevents duplicates.

The first run failed at step 2 because the item page did not pass the `menuImport` messages to the client provider, so raw keys were shown. The page now includes them.

The matrix (ar/fr × light/dark × 390×844 / 1280×800) was captured on the mixed preview. All 8 cases have zero axe WCAG A/AA/2.1/2.2 AA violations and no horizontal overflow. The first capture showed the Arabic row-number heading breaking between letters at 390 px. Column headings no longer wrap and the table region scrolls instead. [Lossless captures](menu-import/)

Design notes (P2, for the M2-12 design critic):
- The native file input shows the browser's own "Choose File / No file chosen" text, which is not localized. Use a labelled button over a visually hidden input.
- An invalid price is shown with the DA suffix (`abc DA`) in the row table.

Not covered: 768×1024, 200% text, XLSX through the browser (covered by unit tests in `apps/web/test/menu-import-file.test.ts`), and a separate design-critic review.
