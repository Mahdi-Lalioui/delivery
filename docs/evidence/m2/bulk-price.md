# M2 bulk price change evidence (MER-11)

The production `pnpm test:e2e:auth` suite passed all 12 Chromium journeys, including `[MER-11:browser]` in `e2e/auth-menu-price.spec.ts`. An owner ticks the whole category, previews a 10% raise rounded to 10 DA (650 → 720, 1 200 → 1 320), applies it, and sees both item rows update without a remount. They undo and see 650 and 1 200 restored. A fixed 50 DA raise is then applied, the API test clock moves past ten minutes, and the undo request returns 409. The panel shows the expired message, removes the undo button, and keeps the 700 DA price.

A temporary capture spec (not committed) rendered the previewed panel in Arabic and French, light and dark, at 390×844 and 1280×800 on the production build. All 8 cases had zero axe WCAG A/AA/2.1/2.2 AA violations and no horizontal overflow. The panel stayed inside the viewport, and every button, select, text input and choice row was at least 44 px tall. The first capture found the rounding select unstyled and under 44 px. It now uses `menu-item-select`. [Lossless captures](bulk-price/) · [Measurements](bulk-price/design-report.json)

Not covered here: 768×1024 and 200% text sizes, and a separate design-critic review. The M2-12 gate run should add them.
