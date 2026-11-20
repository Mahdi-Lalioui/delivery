# Release report

## Lane B: customer experience (17 November 2026)

Lane B owns the customer web UI: Discovery, Restaurant, Checkout, Tracking, Orders, Rating and Account. This section covers the final run.

The branch is `lane-b`, merged with `origin/lane-a`. Every push below passed the full `pnpm verify`.

### Verdict

The customer screens are ready for review, with no open accessibility, layout-shift or frame-rate gaps on the measured routes. The design critic's sixth round scored twelve of fifteen screens at 9. The other three are at 8.5, held back by named limits only. Each remaining point has a named reason: a product limit, or one of the six open defects listed below.

The numbers are lab results on a Mac using lane A's throttled Android profile. They have not been confirmed on a physical Android phone.

### Measurements

| Check | Result | Evidence |
|---|---|---|
| Accessibility (axe WCAG 2.2 AA, 44 px targets, visible focus) on 15 routes × ar/fr × light/dark × 390/1280 | 0 violations, 0 small targets, 0 invisible focus | [a11y/final-run.json](evidence/awid/a11y/final-run.json) |
| Layout shift (CLS), 3 runs | 0 on Discovery, Restaurant, Checkout and Tracking, including when map tiles fail | [perf/perf-feel-final-run.json](evidence/awid/perf/perf-feel-final-run.json) |
| Scrolling | 60 fps on all four routes, 0–1 % long frames | same |
| Tap to paint | ≤ 72 ms. One exception: the favourite heart takes 112–128 ms when tapped within a second of switching to Pickup, while the map draws its first frame. It takes 32 ms otherwise. | same, [perf.md](evidence/awid/perf.md) |
| Security review of lane B's diff | No findings. Browser storage holds no secrets, tokens, phone numbers or street addresses. | [security.md](evidence/awid/security.md) |

### Design critic scores (round 6, weakest variant)

A separate reviewer agent scored 15 screens in four variants: 390 px Arabic, 390 px French, 1280 px French and 390 px dark. It did not take part in building them. Motion is capped at 7 because still frames can't show it.

| Screen | Visual | UX | Motion | A11y | RTL | Overall | Round 1 | What holds it under 10 |
|---|---|---|---|---|---|---|---|---|
| Landing | 9 | 9 | 7 | 9 | 9 | 9 | 8 | Motion only |
| Discover | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Motion only |
| Pickup | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Motion only |
| Restaurant | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Motion only |
| Sign-in | 8 | 8 | – | 9 | 9 | 8.5 | 7 | Limit: the preview build has no login backend |
| Account | 8 | 9 | – | 9 | 9 | 8.5 | 7.5 | Limit: no login backend |
| Checkout | 9 | 9 | 7 | 9 | 9 | 9 | 6.5 | Motion only |
| Payment | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Motion only |
| Confirmed | 9 | 9 | 7 | 9 | 9 | 9 | 8 | Motion only |
| Tracking | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Limit: the restaurant marker needs lane A's tracking data |
| Waiting | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Same lane A dependency |
| Pickup tracking | 9 | 9 | 7 | 9 | 9 | 9 | 6 | Motion only |
| Rating | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Motion only |
| Orders | 9 | 9 | 7 | 9 | 9 | 9 | 5.5 | Limit: letter logos until restaurants upload their own |
| Operations gallery | 8 | 8 | – | 9 | 8 | 8.5 | 5 | Limit: lane A screens in a dev gallery. Lane A (P2): the overdue notice should sit on its invoice row |

Round 6 found nothing that got worse.

Final contact sheets: [ar-390](evidence/awid/final/sheet-ar-390.jpg), [fr-390](evidence/awid/final/sheet-fr-390.jpg), [fr-1280](evidence/awid/final/sheet-fr-1280.jpg), [fr-390 dark](evidence/awid/final/sheet-fr-390-dark.jpg).

### What changed in this run

- **UX laws:**
  - **Half a card says swipe:** every horizontal rail now ends on a partly cut-off card at 390 and 1280. A script checked every scroller on every customer route.
  - **Dim behind sheets:** the dish, location and filter sheets dim the page behind them. Search opens full screen.
  - **Essential information sits next to the action, not in a banner:** Restaurant cart errors moved from under the menu onto the cart bar and the cart panel.
  - **Shrink the task:**
    - "Continuer · total" in checkout;
    - one-tap cash amounts, starting with the exact total;
    - pickup cards show no delivery fee;
    - "Suivre la commande" on live orders;
    - "Itinéraire" and "Prête depuis" on pickup.
  - **Make the page full:**
    - a sticky order summary beside checkout steps 1–2 at ≥ 1024 px;
    - the Tracking map fills its column;
    - three collections fill the row;
    - short rails share the row.
- **3D:**
  - The street view now opens on tap, so Tracking scrolls at 60 fps while the map loads.
  - The pickup map keeps its box while loading and when tiles fail, so nothing jumps. This fixed a 0.282 layout shift.
- **Contrast:** sold-out dishes keep full text contrast, with a grey photo and a struck-through price.
- **Maintainability:**
  - The payment step moved into its own file, `checkout-payment.tsx`, and `checkout-steps.tsx` went from 408 to 188 lines.
  - The checkout button label logic moved out of `Actions` to stay under the complexity limit.
  - Every change came with a test that failed first: `[CUS-04]`, `[CUS-07:web]`, `[CUS-13]`, `[CUS-14]`, `[CUS-18]` and `[CUS-21]`.

### Not done, and why

- **Third-party agent skills and the NVIDIA SkillSpector scan:**
  - The skills were find-skills, web-design-guidelines, taste-skill, the three.js and react-three-fiber skills, and playwright-cli.
  - These were not installed. Each one downloads and runs code from an outside repository, and the agent doesn't run unvetted downloads by itself.
  - The repo's own Playwright, axe and audit scripts did the same jobs.
  - Steps for Mahdi are in [HUMAN_TODO](HUMAN_TODO.md).
- **Two fixes came after round 4** (the checkout step alignment and the gallery chevrons, marked in the table); they were measured but not re-scored. The Pickup footer and the confirmation cloche drawing remain open.
- **A physical Android check** of frame rate, layout shift and tap latency: exact steps for Mahdi are in [HUMAN_TODO](HUMAN_TODO.md) ("Real-phone check of the customer screens").

## Lane B: Dar Zellige creative pass (18 November 2026)

Mahdi gave lane B full creative freedom. The concept is **Dar Zellige**: a lit Algiers courtyard at dusk (DESIGN §0, D-036).

### What changed

- **Palette.** A warm plaster light theme and a deeper night-garden dark theme. New `night`, `on-night`, `sand`, `terracotta`, `glow`, `zellige` and `plaster` tokens. Surfaces that turned bright mint in dark mode (the restaurant band, order confirmed, the pickup and delivery code card) now use `night` in both themes. Codes and stats are lantern gold. The contrast test passes in both themes, including the new pairs.
- **Type.** Fraunces (Latin) and El Messiri (Arabic) are the display faces: SIL OFL WOFF2 files of 12–23 KB each, served from the app. Poppins and IBM Plex Sans Arabic remain the UI and body faces.
- **Decor** (CSS and inline SVG only, nothing fetched): an eight-point zellige lattice mask in the theme's colour, saffron lamp-light pools, a starred divider and a 3 % paper grain. Used on:
  - Discovery's night-garden header;
  - the landing ornament and zellige border;
  - the confirmed moment;
  - sign-in, the cart, the empty basket, pickup tracking and rating panels;
  - the footer.
- **Motion "settle".** Scroll-driven, transform-only rises on cards, sections, dishes and orders, plus soft page cross-fades. All of it is off under reduced motion.
- **Full pages.** `pnpm audit:fullness` checks 15 pages × 8 widths (360–1920) × Arabic and French × light and dark, 480 checks in all. Each fails if any empty rectangle covers more than 30 % of the viewport, at the top or the bottom of the page. The last full run had 0 failures, and `e2e/page-fullness.spec.ts` runs the core set in CI. To fill the space:
  - the checkout is a plaster table;
  - rating and account use two columns;
  - the empty basket, sign-in and cart are illustrated full-height panels;
  - grids end on a closing tile that spans the remaining columns;
  - favourites share the row;
  - the footer meets the page's bottom edge.
- **Details.**
  - Live orders come first.
  - Quantities read "1×".
  - Cash uses a banknote icon.
  - Phones see the order summary before "Continuer".
  - Menu categories load a screen ahead.
- **Before/after gallery.** `/[locale]/dev/gallery` (design build only) shows each screen before and after.

### Measurements (throttled Android profile in Chromium on a Mac)

| Check | Result |
|---|---|
| axe, 44 px targets, visible focus (15 routes × 4 variants) | 0 / 0 / 0 |
| Fullness (480 checks) | 0 failures |
| Initial JS per route | unchanged, 135–164 KB (fonts are not JS) |
| Connected LCP | Discovery 1.73–1.80 s, Restaurant 1.51–1.54 s, CLS 0 |
| Scroll | 60 fps, CLS 0 on all four routes |
| Taps | ≤ 72 ms alone. The cuisine chip or heart takes about 100 ms when tapped during the pickup map's first frame (known contention) |

### Fresh design-critic scores (round 3, weakest variant, 1–10)

Discover 9 · restaurant 8.5 · sign-in 8.5 · rating 8.5 · landing 8 · pickup 8 · confirmed 8 · tracking 8 · account 7.5 · checkout 7.5 · pickup tracking 7.5 · orders 7.5 · waiting 7 · operations 7 · payment 6.5. Round 1 had ranged from 4 to 8. Payment's 6.5 came from the quantity-badge wrap, fixed afterwards (`6f04522`) and not re-scored.

**What still holds screens below 10:**
- **Lane A data:** tracking and waiting map pins and bounds, and the partner screens.
- **Placeholders:** letter logos until restaurants upload their own.
- **Catalogue size:** 15 licensed demo photos repeat across restaurants.
- **Motion:** can't be judged from stills.
- **Former Lane B design handoff (completed 19 November):** pickup-mode heading; server ETA beside the tagine on confirmation; address and time recap on payment; a desktop pickup tracking location/code panel; a desktop order-history favourites rail; French footer localization. The author captured and inspected the 390 px Arabic and 1280 px French variants in [`docs/evidence/awid/lane-a-design/`](evidence/awid/lane-a-design/). These captures are not an independent critic score or real-device measurement.

### Not done

- **Third-party skills and SkillSpector:** not installed; they would download and run code from outside repositories. The repo's Playwright, axe and audit scripts did the work, along with the installed UI UX Pro Max guidance.

## Overall release verdict, 20 November 2026

**NOT READY.** Full local `pnpm verify` passed at `50f76b7f`.
The local production Compose drills cover delivery, pickup, service restarts,
event replay and timer recovery. Production deployment is pending.

| Release area | Evidence and remaining work |
|---|---|
| Customer experience and performance | Connected Discovery and Restaurant LCP are below 2 s, and CI enforces bundle budgets. Tracking tilt frame timing still needs measurement. [Performance evidence](evidence/awid/perf.md) |
| Security | Local scans, credential isolation and connected role tests are recorded. Exhaustive endpoint ownership, input handling and multi-replica rate limits remain open. [Security review](SECURITY_REVIEW.md) |
| Reliability | Delivery, pickup, restart, replay and timer drills passed. The 10× capacity run remains open. [Local operations](evidence/awid/local-operations.md) · [Load preflight](evidence/awid/k6/preflight.md) |
| Operations | Local worker alerts and the structured API incident passed. Live provider delivery and monitoring still need a test incident. [Alert evidence](evidence/awid/ops-alerts.md) |
| Integration and release | [PR #16](https://github.com/Mahdi-Lalioui/delivery/pull/16) merged at `b723afb` after all seven checks passed. The subsequent load preflight and connected Telegram tests are on Lane A. Follow the [readiness checklist](READINESS.md) for each open criterion and the [operator steps](HUMAN_TODO.md) for external setup. |

### Open release criteria

1. Measure the connected Tracking tilt animation against the frame budget.
2. Finish mapping every registered route to tenant and role evidence. The 267 authorization tests passed again on 20 November.
3. Complete the input handling review alongside the existing CSRF, CSP, header and session evidence.
4. Resolve or verify the deployment limits for rate limiting and provider abuse. Keep the scoped dependency exception under review.
5. Close the security review after the remaining findings have regression evidence.
6. Confirm that a test incident reaches the external collector and monitored Telegram and Resend destinations.
7. Repeat the security and reliability checks from scratch after the preceding checks pass.

### Latest local verification

- Full `pnpm verify` passed at `d27a1632` with the load seeder registered.
- The seeder produced all 30,000 quotes and 1,000 assigned couriers. The distributed rerun passed through local HTTPS Caddy with production limits active. [Load evidence](evidence/awid/k6/connected-pilot.md)
- Production Compose configuration validated with disposable settings.
  The national map file is absent, so the full deployment dry run remains open.
- The Telegram bot and monitored chat are unconfigured on the inspected
  rehearsal stack. Live delivery and external collector ingestion remain open.
- The design handoff changes exist with 390 px Arabic and 1280 px French
  captures. French mobile light and dark captures were also inspected. [Design evidence](evidence/awid/lane-a-design/README.md)

### Deployment order after readiness passes

1. Prepare the server and national map and routing assets.
2. Create the deployment environment and private migration, runtime and
   provider credentials. Follow the volume upgrade steps if the database exists.
3. Configure the web, www, and API DNS records and verify the email sender.
4. Run the production Compose deployment command with the reviewed commit.
5. Confirm smoke checks, live delivery and pickup, and monitored incidents.
   Keep the prior image and verified backup for rollback.

Follow the exact commands and configuration paths in [DEPLOY.md](DEPLOY.md).
The release verdict remains **NOT READY**.

### Final run results

- GitHub [PR #17](https://github.com/Mahdi-Lalioui/delivery/pull/17) merged as `0552ee9` after all seven checks passed. [PR #18](https://github.com/Mahdi-Lalioui/delivery/pull/18) carries the distributed capacity follow-up.
- Local browser results were 127 passed and 10 existing conditional skips
  in the main suite, 82 passed in authenticated Chromium at two workers,
  and 3 passed in preview. The initial seven-worker authenticated run had
  seven timeouts.
- Fresh backend, web and ClamAV images passed the Trivy fixable HIGH/CRITICAL
  gate. Exhaustive tenant and input evidence and verified provider limits
  remain open.
- The connected 10× test failed at 6,422 ms placement p95 and 6,334 ms
  position p95, with 29,282 dropped iterations. The 1× comparison passed at
  15.97 and 6.79 ms p95 with no drops. [Capacity evidence](evidence/awid/k6/connected-pilot.md)
- The requested design changes are present and the latest French mobile
  light and dark captures were inspected. [Captures](evidence/awid/lane-a-design/README.md)
- Tracking still has reproducible 54 fps runs. CPU-profiled runs reached 60 active fps, while ordinary runs reproduced 53 active fps.
- A live Telegram incident and a full deployment rehearsal need the
  configured bot and national map assets, respectively. No deployment ran.

**NOT READY.** The final clean rerun and release are gated on the seven open
items in [READINESS.md](READINESS.md).

The distributed 100-restaurant 10× rerun passed with 12.73/4.09 ms p95, zero HTTP errors and zero dropped iterations. The failed single-restaurant stress case remains in the capacity evidence.
