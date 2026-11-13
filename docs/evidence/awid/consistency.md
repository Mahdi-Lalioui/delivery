# Customer consistency audit (lane B, 2026-11-12)

Scope: every customer stylesheet (`discovery/`, `restaurant/`, `checkout/`, `tracking/`,
`retention/`, `account/`, `customer/`, `maps/`) and the DOM-built map markers. Method: scan for
values that bypass DESIGN.md tokens (spacing, radii, shadows, type, durations, easing,
breakpoints), then review icon and control usage. Every deviation below is fixed.

## Deviations found and fixed

| # | Where | Deviation | Fix |
|---|---|---|---|
| 1 | `discovery-location.css` | Raw `320ms cubic-bezier(0.05, 0.7, 0.1, 1)` sheet entry | `var(--motion-slow) var(--ease-decelerate)` |
| 2 | `discovery-location.css` | Raw `80ms` fade | `var(--motion-instant)` |
| 3 | `discovery-location.css` | Breakpoint `35rem` (560 px) | 639 px (phone breakpoint) |
| 4 | `feed.css`, `tracking.css` | Skeleton shimmer `1.4s` | `var(--motion-scene)` |
| 5 | `tracking.css` | Route draw `1.4s`, pulse `1.8s` | `var(--motion-scene)`, `calc(var(--motion-scene) * 1.5)` |
| 6 | `feed.css` vs `restaurant.css` | Card stagger 30 ms steps vs 40 ms steps | Both `calc(var(--motion-instant) / 2 * n)` (40 ms) |
| 7 | `feed.css` filter switch | `44px × 26px` track, thumb drawn at `13px`/`31px` with `10px` radius | `--space-48 × --space-24` track, thumb from `--space-12`/`--space-20`, same as the Sensations switch |
| 8 | `restaurant.css` | Breakpoints 768 px and 479 px | 640 px and 639 px |
| 9 | `retention.css` | Breakpoints `64rem` and `40rem` | 960 px and 639 px |
| 10 | `search.css` | Breakpoint 720 px | 640 px |
| 11 | `retention.css` | Avatar ring `6px` (feed, menu and map use `3px`) | `3px` everywhere |
| 12 | `retention.css` | Avatar sizes `88px`, `56px`, `32px`, row `64px`, card `320px` | Space tokens (`--space-80 + --space-8`, `--space-48 + --space-8`, `--space-32`, `--space-64`) and `20rem` |
| 13 | `tracking.css`, `checkout.css` | Letter spacing `0.12em`, `0.06em`, `-0.02em` | `--letter-spacing-micro`, `--letter-spacing-display-xl` |
| 14 | `tracking.css` | Rider marker `1.8rem`, inset `0.45rem` | `--space-32`, `--space-8` |
| 15 | `search.css` | `calc(var(--space-16) + 4px)` | `calc(var(--space-16) + var(--space-4))` |
| 16 | `algeria-map.css`, `tracking.css` | `border-radius: 50%` | `var(--radius-pill)` |
| 17 | `algeria-map.css` | `font-weight: 600` | `var(--font-weight-label)` |
| 18 | Pickup pin card | Text "★" where every other rating uses the star icon | `iconElement("star")` from `@zaafran/ui` (same path as `<Icon>`) |
| 19 | Pickup pin card | Facts spoken as "★ 4,7 · 20–30 min" | Link `aria-label`: name, "noté 4,7 sur 5", wait |
| 20 | Sensations card | Border card with legend on the border, unlike the list card above it | Same surface, `--radius-xl` and `--shadow-e1` as the list; legend as card heading |
| 21 | Basemap | Stock Protomaps greys, English fallback labels, POI icons | AWID tokens, page-language labels, no POIs |

## Kept on purpose

- `1px` hairlines and the `1px` visually-hidden pattern; `2px`/`3px` border widths for rings and
  selected states (no border-width token exists; values are consistent per role).
- Layout measures in `rem` (`max-inline-size`, grid track minimums): content widths, not spacing.
- Breakpoints now use only 640 px, 960 px and 1200 px (plus 639 px as the phone maximum).
