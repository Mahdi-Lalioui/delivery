# Customer accessibility (lane B, 2026-11-12)

Production preview build (`next build` + `next start`, `ZAAFRAN_PREVIEW_DEMO=1`).

## Automated audit: `pnpm audit:customer-a11y http://127.0.0.1:3110 <out.json>`

15 customer routes (landing, discovery, pickup, restaurants pitch, restaurant menu, sign-in,
account, checkout, checkout payment, confirmed, tracking, tracking waiting, pickup tracking,
rating, orders) × 4 variants (fr 390 light, ar 390 light, fr 1280 dark, ar 390 dark), reduced
motion on. Each run: axe-core 4.14 with WCAG 2.0/2.1/2.2 A and AA tags (covers colour contrast in
both themes, names, labels, landmarks, titles); every visible control measured against 44 × 44 px
(a stretched card link counts as its card, a label counts for its input); 30 Tab presses with
a check that each focused control shows an outline or ring.

| Round | axe violations | Targets < 44 px | Invisible focus | Fixes after the round |
|---|---|---|---|---|
| [1](round-1.json) | 40 | 180 | – | Page titles (layout default + restaurant name), pin label vs visible text, small buttons 40→44 px, OSM link, landing link; checker learns stretched links |
| [2](round-2.json) | 0 | 0 | – | Added the keyboard focus check |
| [3](round-3.json) | 0 | 0 | 4 | Inputs showed focus by a 1 px border tint only → 2 px ring |
| [4](round-4.json) | 0 | 0 | 0 | Keyboard journey found the dish sheet's Add unreachable (see below) |
| [5](round-5.json) | 0 | 0 | 0 | – |

## Keyboard journey on desktop: `pnpm audit:keyboard-journey http://127.0.0.1:3110 <locale>`

1280 px, keyboard only: restaurant → first dish Add → dish sheet → Add → cart → Checkout.
Found and fixed: while a required choice was missing, the sheet's Add button was `disabled`, so
Tab skipped it and keyboard and screen-reader users never heard "Choose a size". It is now
focusable with `aria-disabled`; pressing it moves focus to the first missing choice.
Results in [keyboard-journey.txt](keyboard-journey.txt): fr, ar and en reach `/checkout`. The
first en run, started seconds after `next start`, stopped before reaching the cart; the rerun
passed. Treat as a cold-start timing issue in the script, not the app.
