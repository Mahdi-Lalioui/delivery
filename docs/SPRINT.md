# Sprint: AWID — a complete, deployed, reliable web app for all of Algeria, with an exceptional interface

## Goal
Customer orders (delivery or pickup, cash) → restaurant accepts on a live board → courier delivers and is visible on the customer's map → customer rates. Web on Vercel, backend on one server. People who open it should be impressed within five seconds, and nothing may look broken, empty or generic.

## How to work
- Do everything on your list, in order, without waiting for Mahdi. If something needs him, add it to docs/HUMAN_TODO.md and continue with the next task. When the list is done, re-check every finished item against the definitions of done and fix what fails.
- Choose your own effort level per task, and decide yourself when a sub-agent is worth it. Spend more on order state, money, security and on design-critical screens; less on mechanical work.
- Commit and push after every task. Keep progress entries to 2 lines; the last line always says exactly what to do next, so a fresh session can resume.
- Run the affected package's tests, typecheck and lint as you go. Full pnpm verify at every phase merge.
- Out of scope: native apps, partner app, billing automation, promotions redemption, Ramadan features, menu photo import, benchmarks, mutation tests, k6.
- Mahdi's external reviewer reads the repo every evening; fix its P0/P1 findings first when they are pasted.

## Never skipped
- AGENTS.md §10 P0 list. An authz matrix row for every route. Tenant and user from the session only. Idempotent order placement and transitions. Rate limits on OTP and position intake.
- Nothing from the demo branch's local-demo-* files or its auth-service code override reaches any lane or main.

## Lanes and ownership
- Lane A, Codex 1, branch lane-a: packages/contracts, db, domain, geo; apps/api; apps/worker; infra and deployment; apps/web merchant, courier and admin screens; e2e tests.
- Lane B, Claude Code, branch lane-b: packages/tokens and ui; apps/web marketing, discovery, restaurant, cart, checkout, tracking, retention; photos, motion, 3D. Lane B owns the design system and every other lane follows it.
- Lane C is paused. Lane A owns its work and proceeds without a second Codex.
- Only lane A edits contracts and migrations; others ask in docs/requests/. Lane A publishes each contract before building behind it. Lane B builds on fixtures until the API lands.
- Lane A merges lane-a, then lane-b into main at the end of each phase.

## Brand
- Name: AWID (Arabic أويد until Mahdi confirms). Tagline: "You're in need, try AWID". Change display names only (packages/config/src/brand.ts, messages, manifest, metadata, logo). Do not rename package scopes or environment variables.
- docs/brand/awid-reference.jpg is a starting point to improve on, not a layout to copy.
- Palette: deep green #0B3D2E, green #00A37A, mint #4DE3B4, pale mint #D9FCE7, cream #FFF8E6. Text and primary buttons use deep green; #00A37A is for large shapes, icons and accents (white small text on it fails contrast). Keep the token contrast test passing in light and dark.
- Type: Poppins (Latin) with IBM Plex Sans Arabic, self-hosted. Big confident headlines, comfortable body, tabular numerals for prices.

## Design brief (all lanes)
Art direction: fresh, confident, appetising, unmistakably Algerian. Cream and white surfaces, deep green for structure, mint for energy, and food photography as the hero of every screen. Radii 20–28 px, soft layered shadows tinted green, generous spacing on a 4/8 grid. One brand motif used sparingly: a zellige tile pattern (headers, empty states, loaders) and the soft wave from the reference as a section divider.

App shell: mobile first. Bottom tab bar (Home, Search, Orders, Profile) with an animated active indicator. A location pill at the top ("Deliver to …"). A sticky cart bar that slides up when the cart has items and shows an animated total. Bottom sheets for dish options, filters and addresses. On desktop the same content sits in a centred layout with a persistent cart panel.

Screens:
1. Landing: full-screen photography of Algeria with slow zoom and crossfade, headline and location search on top, then a photo cuisine carousel, city collections, an animated how-it-works, the restaurant pitch, a real footer.
2. Discovery: greeting and location pill, search, a promo carousel, cuisine chips with photos, horizontally scrolling sections (Near you, Top rated, Free delivery, New), a sticky filter and sort bar. Cards: large photo, overlapping logo, name, rating, delivery time, fee, open badge, a favourite heart with a burst animation.
3. Restaurant: parallax cover that collapses into a sticky title with scroll-spy category tabs, a Popular row, dish rows with photos, an Add button that morphs into a quantity stepper, reviews.
4. Dish sheet: large photo, styled option groups, quantity stepper, sticky Add button with a live price.
5. Checkout: three steps with a progress indicator, a delivery/pickup segmented control with a sliding thumb, an address pin that drops on the map, a summary with an animated total, and a Place order button that morphs loading → success.
6. Order confirmed: a full-screen celebratory moment, then an automatic transition into tracking.
7. Tracking: map in a custom AWID style on the top 60%, a scooter marker that moves smoothly and rotates with its heading, the route line drawing in, and a bottom sheet with an animated status timeline, live ETA, courier card and call button. Pickup shows a pickup code instead of the map.
8. Orders, receipt, rating with spring-animated stars, profile, sign-in.
9. Restaurant board: columns New / Preparing / Ready, large ticket cards with a countdown ring, pulse and sound on a new order, big touch targets. Courier: big buttons, map, slide-to-confirm delivery. Admin: dense but calm.

Motion: 150 / 250 / 400 ms, easing cubic-bezier(0.2, 0.8, 0.2, 1), springs for playful moments, transform and opacity only. View Transitions for page changes and shared elements (card photo → restaurant cover) with a fallback. Staggered list entrances, skeleton shimmer, press scale 0.97, numbers that animate when they change. Everything off under prefers-reduced-motion.

3D: at most one scene. It must animate by itself without scrolling, hold 60 fps, and fall back to photo motion. If it is not excellent after a bounded effort, remove it.

Content: realistic names, dishes, prices in DA and reviews everywhere. Photos only from Wikimedia Commons, Unsplash or Pexels, each one viewed before use, converted to WebP, with URL, author and licence in docs/PHOTO_CREDITS.md. One icon set at one stroke weight. Custom SVG illustrations in brand colours for empty states. No emoji as icons.

Forbidden (they make it look cheap): generic colour gradients, default browser controls, lorem ipsum, mixed radii or shadow styles, borders around everything, centred walls of text, tiny tap targets, layout that jumps while loading, empty-looking pages, an Arabic layout that is only mirrored without checking icons and numerals.

## Design loop — required for every screen
1. Build it, run it, and take screenshots at 390 px Arabic, 390 px French, 1280 px French, and dark mode.
2. Look at the screenshots and write down at least five concrete flaws against this rubric: one clear focal point, spacing rhythm, alignment, type scale, colour discipline, photo quality and crop, density (neither empty nor cluttered), touch targets ≥ 44 px, all states present, RTL correctness, motion smoothness.
3. Fix them and screenshot again. At least two rounds. Tick the screen only when the screenshot could pass for a shipped top-tier consumer app.
4. Save the final screenshots in docs/evidence/awid/<screen>/ and add the screen to a gallery page at /[locale]/dev/gallery so Mahdi can review everything in one place.
Order of work for lane B: design system and gallery first; then Discovery, Restaurant and Tracking to final quality; then the rest.

## Definition of done for every screen
Loading skeleton, empty state, error state. 390 px Arabic and 1280 px French, light and dark. No console errors, no horizontal overflow, no layout shift. Passed the design loop.

## Lane A tasks

1. Publish contracts for orders, quotes, addresses, tracking, couriers, and feed fields and filters.
2. Implement orders per SPEC §3–4: cash pricing, delivery or pickup (no pickup fee or courier), zone fee, idempotent placement, transitions, accept-timeout job, and feed filters and sorting (CUS-04, CUS-06).
3. Build the restaurant live board with new-order sound, accept, reject, ready, handover, cancel, an offline banner and event replay.
4. Add realtime SSE with polling fallback, web push for status changes, and an environment-configured SMS adapter.
5. Build the courier API, then courier screens: invite acceptance, assigned deliveries, start, validated position updates every 5 seconds, delivery code confirmation and customer broadcasts.
6. Add nationwide maps and location: AWID-styled PMTiles, OSRM ETA with fallback, wilaya and commune selection for all 69 wilayas, restaurant-defined delivery radius, and 40 seeded restaurants across at least eight cities with menus, photos, ratings and reviews.
7. Deploy the backend on one server with production Compose, Caddy and TLS on an sslip.io hostname, API, worker, PostGIS, tiles, OSRM, one-command deploy, health checks and nightly encrypted backups. Deploy the web on Vercel through the existing `ZAAFRAN_API_ORIGIN` rewrite and verify cookies, media and realtime. Connect directly for realtime if the rewrite buffers. Document the settings in `docs/DEPLOY.md`.
8. Build admin live orders and complete both open handoffs in `docs/requests/` (merchant notice and moderation token).
9. Add production-build e2e for the delivery golden path, pickup, rejection, timeout and customer cancellation. Port `e2e/demo-smoke.ts` as a route smoke check for Arabic and French, covering console errors and overflow.
10. Restyle merchant, courier and admin screens with Lane B’s design system and run the design loop on each.
11. Freeze. Fix findings and failing e2e until everything is green.

## Lane B tasks (priority order)
1. Rewrite docs/DESIGN.md for AWID from the brief above and record it in DECISIONS.md. New tokens, fonts, a clean SVG logo and app icon redrawn from the reference, every packages/ui component restyled, the gallery page.
2. Choose and credit 15–20 photos of Algeria (Algiers with Maqam Echahid, Oran, Constantine, Ghardaïa, Tlemcen, Béjaïa, the Sahara, food and markets).
3. Discovery, Restaurant and dish sheet, cart.
4. Checkout, order confirmed, tracking, rating.
5. Landing.
6. Orders, receipt, profile, sign-in. Page transitions and micro-interactions throughout.
7. Installable app: icons, install prompt, offline shell, push opt-in.
8. The 3D scene, under the rule above.
9. Final sweep of every customer screen through the design loop.
