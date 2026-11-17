# Release report

## Lane B: customer experience (17 November 2026)

Lane B owns the customer web UI: Discovery, Restaurant, Checkout, Tracking, Orders, Rating and Account. This section covers the final run.

The branch is `lane-b`, merged with `origin/lane-a`. Every push below passed the full `pnpm verify`.

### Verdict

The customer screens are ready for review, with no open accessibility, layout-shift or frame-rate gaps on the measured routes. The design critic's final round scored every screen between 8 and 9 out of 10. Each remaining point has a named reason: a product limit, or one of the six open defects listed below.

The numbers are lab results on a Mac using lane A's throttled Android profile. They have not been confirmed on a physical Android phone.

### Measurements

| Check | Result | Evidence |
|---|---|---|
| Accessibility (axe WCAG 2.2 AA, 44 px targets, visible focus) on 15 routes × ar/fr × light/dark × 390/1280 | 0 violations, 0 small targets, 0 invisible focus | [a11y/final-run.json](evidence/awid/a11y/final-run.json) |
| Layout shift (CLS), 3 runs | 0 on Discovery, Restaurant, Checkout and Tracking, including when map tiles fail | [perf/perf-feel-final-run.json](evidence/awid/perf/perf-feel-final-run.json) |
| Scrolling | 60 fps on all four routes, 0–1 % long frames | same |
| Tap to paint | ≤ 80 ms. One exception: the favourite heart takes 128 ms when tapped during the second after switching to Pickup, while the map draws its first frame. It takes 16–32 ms otherwise. | same, [perf.md](evidence/awid/perf.md) |
| Security review of lane B's diff | No findings. Browser storage holds no secrets, tokens, phone numbers or street addresses. | [security.md](evidence/awid/security.md) |

### Design critic scores (final round, weakest variant)

A separate reviewer agent, which did not take part in building the screens, scored 15 screens in four variants: 390 px Arabic, 390 px French, 1280 px French, and 390 px dark. It scored three rounds in all. Motion is capped at 7 because still frames can't show it; the motion evidence is in [feel](evidence/awid/feel/README.md) and [perf.md](evidence/awid/perf.md).

| Screen | Visual | UX | Motion | A11y | RTL | Overall | Round 1 | What holds it under 10 |
|---|---|---|---|---|---|---|---|---|
| Landing | 8 | 9 | 7 | 9 | 9 | 8.5 | 8 | Limit: the hero photo is a monument, not food (imagery pending) |
| Discover | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Fixed after scoring: compact rail cards drop the clipped "Ouvre le …" line (the cover's "Fermé" badge stays, the full card gives the time) |
| Pickup | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Defect: a 1280 page ends on bare links, with no footer |
| Restaurant | 8 | 8 | 7 | 9 | 9 | 8 | 7 | Fixed after scoring: two or three popular dishes share the row at 1280. By design: later categories load as you scroll near them, so full-page captures show their skeletons |
| Sign-in | 8 | 8 | – | 9 | 9 | 8.5 | 7 | Limit: the preview build has no login backend |
| Account | 8 | 9 | – | 9 | 9 | 8.5 | 7.5 | Limit: no login backend |
| Checkout | 9 | 9 | 7 | 9 | 8 | 9 | 6.5 | Limit: saved address labels are the customer's own text |
| Payment | 8 | 9 | 7 | 9 | 9 | 8.5 | 7 | Fixed after scoring: step 3 keeps two columns at ≥ 1024 px, cash on the start side and the receipt beside it |
| Confirmed | 7 | 9 | 7 | 9 | 9 | 8 | 8 | Open: the cloche drawing needs redrawing |
| Tracking | 9 | 9 | 7 | 9 | 9 | 9 | 7 | Limit: restaurant and home markers need lane A's tracking data |
| Waiting | 8 | 8 | 7 | 9 | 9 | 8.5 | 7 | Fixed after scoring: the address is the brand home pin. Limit: the restaurant marker needs lane A's tracking data |
| Pickup tracking | 8 | 9 | 7 | 9 | 9 | 9 | 6 | Fixed after scoring: no grab handle when there is no map behind the sheet |
| Rating | 8 | 8 | 7 | 9 | 9 | 8.5 | 7 | Fixed after scoring: the subtitle names the restaurant and the order code (from the first page of order history) |
| Orders | 9 | 9 | 7 | 9 | 9 | 9 | 5.5 | Limit: letter logos until restaurants upload their own |
| Operations gallery | 8 | 8 | – | 9 | 8 | 8.5 | 5 | Limit: lane A's screens shown in the dev gallery; its state switch is a dev tool |

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
- **The critic's six open defects** were fixed after its final round (marked "Fixed after scoring" in the table). The scores above are from before those fixes; they were not re-scored.
- **A physical Android check** of frame rate, layout shift and tap latency: exact steps for Mahdi are in [HUMAN_TODO](HUMAN_TODO.md) ("Real-phone check of the customer screens").
