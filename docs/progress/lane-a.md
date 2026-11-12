# Lane A progress

- 2026-11-08 · Low · Recorded the parallel build rules. Next, integrate the green milestone branches, publish lane B contracts and finish M2.
- 2026-11-08 · High · Integrated M0, M1 and the green M2 baseline in order. Both lanes start at `9f675ed`. M2 CI passed all six checks, local verification passed 1,250 unit and 156 PostGIS tests, and Playwright passed 59 foundation and 16 auth cases.
- 2026-11-08 · High · M2 gate remains open at 35/37 acceptance IDs (`MER-01`, `MER-14`). See [baseline audit](../evidence/m2/baseline-audit.md). Local mutation score was 94.07%. The dependency audit reports moderate `GHSA-g3hv-75wg-m249` in tooling via `packages/config`.
- 2026-11-08 · Low · Active worktree is `../lane-a` beside the original `delivery` checkout. Import UI work stays in the original checkout on `m2-merchant-onboarding`; preserve its uncommitted changes. Publish Lane B contracts before resuming it.
- 2026-11-08 · Ultra · `@zaafran/contracts/billing` defines owner subscription, invoice and transfer-proof schemas and admin list, issue, void, record-payment and billing settings schemas. Eight focused cases passed, including the private invoice proof upload contract and zero-tax guard. Lane B owns the routes and UI.
- 2026-11-08 · High · `@zaafran/contracts/promotions` defines code/automatic promotions, discount and eligibility inputs, stats, and four quote rejection codes. All 32 focused cases passed, including rejection of text that cannot round-trip to PostgreSQL. Lane A owns quote integration and redemption.
- 2026-11-08 · Ultra · `@zaafran/contracts/ratings` defines customer rating input and merchant review list, reply and report schemas. All seven focused cases passed. Order ownership, delivery eligibility, edit deadlines and audit are server responsibilities.
- 2026-11-08 · Ultra · `@zaafran/contracts/scheduling` defines address-bound delivery and address-free pickup discovery. All 16 focused cases passed, including preserving exact Iftar time. Server quote and placement revalidate every selection.
- 2026-11-08 · Low · Handoff: rebase or cherry-pick the shared contract commit onto `lane-b` when needed. Lane A next resumes the import hook and production journey, then closes the media, hours, preview, seed and M2 gate gaps.
- 2026-11-08 · Ultra review · No open P0/P1 after the promotion text and billing private-proof fixes. `pnpm verify` exited 0 with 1,313 unit and 156 PostGIS integration tests. Contract cases are qualified so they do not close feature acceptance IDs.
- 2026-11-08 · Ultra · M2-8 menu import opens on an empty menu, binds preview to the live session, and retries a committed apply with its original key after failed readback. `pnpm verify` passed 1,384 unit and 156 PostGIS tests. Playwright passed 59 foundation and 17 auth cases.
- 2026-11-08 · Ultra review · Closed parser metadata and preview identity findings and moved full `MER-12` trace proof to the production browser journey. See [import evidence](../evidence/m2/menu-import.md). Next M2-6 bounded private preview codec and Linux amd64 HEVC conformance under D-007, then the persisted worker job.
- 2026-11-08 · Ultra · Proved M2-6 private preview codec and pinned amd64 HEVC runtime. `pnpm verify` passed 1,411 unit and 156 PostGIS tests. Eight native cases and real HEVC-to-WebP conformance passed. No open P0/P1 in the codec review.
- 2026-11-08 · Ultra · Resume with a forward media migration and private preparation worker. Keep infrastructure failures retryable and temporary inputs lifecycle-scoped. See [codec evidence](../evidence/m2/photo-prepare.md). The old import copy in `../delivery` is superseded by Lane A.
- 2026-11-08 · Medium · Isolated Lane B Compose and browser ports with `infra/lane-b.env`. Both Docker projects ran concurrently and Lane B's PostGIS, Martin and OSRM smoke passed. `pnpm verify` passed on B with 1,411 unit and 156 PostGIS cases, and both lanes passed 59 foundation and 17 auth browser cases.
- 2026-11-08 · Medium review · No P0/P1 on lane isolation. Fresh M2 trace exits 1 at 35/37 (`MER-01`, `MER-14`). Next the private media preparation migration and worker, followed by crop publication, application/item photo attachment and the remaining M2 gate work.
- 2026-11-08 · Ultra · M2-6 Graphile preparation verifies the quarantined original, stores a private WebP before CAS, and serves it through owner-scoped API access. `pnpm verify` passed 1,422 unit and 161 PostGIS tests. Review closed all P0/P1 with rollout sequencing in D-018.
- 2026-11-08 · Ultra · Next bind crop to the original reservation session and publish all variants from the quarantined original. See [photo preparation evidence](../evidence/m2/photo-prepare.md).
- 2026-11-08 · Ultra · M2-6 crop binds to the original live session, enqueues once, and publishes ten private variants plus ThumbHash before cleanup. `pnpm verify` passed 1,432 unit and 169 PostGIS tests. Real HEVC and SeaweedFS conformance passed. Review closed P0/P1 with rollout and legacy behavior in D-019.
- 2026-11-08 · Ultra · Next wire ready photos into merchant applications and menu items, then add the localized crop UI and browser journey. See [media evidence](../evidence/m2/photo-prepare.md).

- 2026-11-08 · Ultra · M2-6 application and item photo attachment passed `pnpm verify` with 1,449 unit and 174 PostGIS cases, plus 17 auth and 59 foundation browser cases. Review closed both P1s. See [evidence](../evidence/m2/photo-prepare.md).
- 2026-11-08 · High · Resume M2-9 dated exceptions. Reuse the existing revision-bound hours command and preview. Close admin notice delivery, cover/logo controls, moderated preview, seed and gate wiring before closing M2.

- 2026-11-08 · High and ultra · M2-9 dated exceptions passed `pnpm verify` with 1,461 unit and 174 PostGIS tests, plus three production browser cases. A sibling schedule save cannot let a stale draft overwrite another tab’s exception. See [hours evidence](../evidence/m2/hours.md).
- 2026-11-08 · Ultra · Next stabilize the import CRC test, whose UTF-8 string offset can differ from the ZIP byte offset. Then add the MER-01 notice read for Lane B’s admin UI and the moderated customer preview for Lane A.

- 2026-11-08 · Ultra · Fixed the M2-8 ZIP CRC fixture using a deterministic timestamp, byte offset and valid-XML control. All 15 file tests passed. Review confirmed truncation and overlap checks are unchanged.

- 2026-11-08 · Ultra · Published the MER-01 in-app notice response contract in `@zaafran/contracts/admin`. The focused test failed before the schema and all eight admin contract tests passed afterward. D-021 records delivery scope and Lane B UI ownership.

- 2026-11-08 · Ultra · MER-01 notice API passed `pnpm verify` with 1,466 unit and 176 PostGIS tests. Production signup and review proved pending notice, retirement and applicant denial. [Lane B handoff](../requests/lane-a-merchant-notice.md) covers the visible notice.
- 2026-11-08 · High · Next implement the authenticated, read-only merchant menu preview. Filter archived, held and rejected items in the card, cursor and detail queries. Keep publication and anonymous customer pages in M3.

- 2026-11-08 · High · The shared menu preview contracts define a revision-bound category page and on-demand item detail. Two new contract cases failed before implementation. All five focused preview and item cases passed. See D-022.

- 2026-11-08 · High and ultra · M2 settings schema, moderated customer preview and demo seed passed `pnpm verify` with 1,493 unit and 185 PostGIS tests, plus all 18 authenticated production browser journeys.
- 2026-11-08 · High · Inspected Arabic and French preview at phone and desktop sizes. The design critic passed. [Evidence](../evidence/m2/menu-preview.md)
- 2026-11-08 · Medium · Mahdi prioritized closing M2, batching Lane B requests, then M3 by Monday night. Finish cover/logo and the combined onboarding browser gate. Track Lane B’s notice and review-token UI in `docs/requests/`. Existing Lane A screens need the premium design pass by 15 November.

- 2026-11-08 · Ultra, high and medium · Cover/logo and combined onboarding passed with 1,518 unit, 187 PostGIS, 203 authorization and 19 authenticated browser cases. Phone and desktop captures passed the design review. [Evidence](../evidence/m2/profile-photos.md)
- 2026-11-08 · High · The actual M2 gate remains at 36/37 because the visible admin notice belongs to Lane B. Two Lane B UI handoffs are open. Prepare the requested shared backend batch from `origin/lane-b` at `2be68d5` while waiting for integration, then M3.
- 2026-11-08 · High · Shared Lane B batch contracts cover settings, public flags, audit, support, favourites, history, receipt, reorder, recipient, analytics, photo-import drafts, privacy, promo lists and Ramadan timing. Six focused cases passed. Published billing and rating schemas remain the API contract.

- 2026-11-08 · Ultra · Lane B batch in the Lane A worktree. Promotion DB scope passed 169 PostGIS tests, including five promotion cases. Seven focused API suites passed 25 tests across billing, promotions, platform settings, Ramadan and the route authorization matrix.
- 2026-11-08 · Ultra · Billing overlap and mixed-case admin replay regressions passed under their respective locks. `pnpm verify` passed with 1,539 unit and 210 PostGIS cases, authz with 218, and the production browser regressions with 19.
- 2026-11-08 · Low · See the [batch handoff](../requests/lane-a-backend-batch.md) for API bindings and pending order, ratings and billing lifecycle dependencies. M3 starts with the service-area data and location contract.

- 2026-11-08 · High and ultra · M3-1 started from `67ec76f` on `lane-a`. Contract `4cd1936` uses a public POST body for exact pins and keeps coverage separate from ordering. Two contract and 13 HTTP/inventory tests passed. The compiled production regression reproduced a 404 before wiring.
- 2026-11-08 · Low · M2 remains at 36/37. Lane B `db00086` has no visible notice wiring. The goal tool still holds the unfinished M2 goal and rejected creating M3. Track M3 in PLAN until M2 can close.
- 2026-11-08 · Ultra and high · Location lookup and GPS/commune picker passed 1,553 unit, 216 PostGIS, 222 authorization and three production browser cases. Both reviews cleared after cache, stale-selection and contrast fixes. [Evidence](../evidence/m3/location.md)
- 2026-11-08 · High · Resume M3-2 at public `GET /v1/feed`. Start with active merchants, bounded keyset pages, batched hours and tenant-scoped ready photos. Keep geo ranking, live fees, ETA and payment methods tied to their real producers. M3-1 map, opt-in and editor stay open.

- 2026-11-08 · Ultra and high · Public feed and current profile variants passed 1,568 unit, 222 PostGIS, 224 authorization and two production browser cases. Reviewer closed the extended-year pause P0 and design critic approved eight captures. [Evidence](../evidence/m3/feed.md)
- 2026-11-08 · High · Resume M3-3 with the search index and ranking. Share live publication checks with the feed and later restaurant pages. Keep M3-2 open for global ordering, additional sections and commercial data.

- 2026-11-08 · High · Evening integration is pushed to main at `1a7a77e`, including Lane A `233e62f` and Lane B `8171285`. Verify passed 1,700 unit, 222 PostGIS and four mobile Jest cases; production suites passed 59 and 24. Main serves marketing at locale root and customer discovery at `/discover`.
- 2026-11-08 · Ultra and high · Search is in progress on lane-a with contract commit `dc756fc` and uncommitted DB/API/worker/UI changes. DB agent proved 204 PostGIS cases. HTTP aliases passed 11 cases. Graphile wiring still needs the running session/log result checked. Production search journey is authored but unrun.
- 2026-11-08 · Ultra review · Fix open search work-bound P1 before pushing. Red regressions are in discovery-search integration (one-character query) and API HTTP (Postgres 57014 maps to 503 search_busy). Add minimum normalized length and transaction-local statement timeout, then verify. Agents reached usage limit at 19:05; preserve all files.
- 2026-11-08 · High · Resume with those P1s, finish search UI integration in Home, real worker/browser proof, screenshot matrix and review. Do not rebase the dirty lane-a worktree. After committing, merge current main to retain `/discover` and Lane B updates. M2 remains 36/37.

- 2026-11-08 · Ultra · Search work-bound fixes now pass two HTTP and 14 real PostGIS/Graphile tests. One-character queries return no matches, SQL statements have a 500ms local timeout, and cancellation maps to retryable search_busy. Independent review and full benchmark remain before closing the review item.
- 2026-11-08 · High · Search screen is mounted in Home. Worker production build now rewrites relative TypeScript import extensions like API. French production search journey passed; Arabic reached successful results and reload but the history assertion ambiguously matches a suggestion and recent query. Scope assertion to recent-history region next, then run full verify and capture/review before push.
- 2026-11-08 · High · Both production search journeys now pass after scoping the history assertion with a relative locator. Eight captures are saved under docs/evidence/m3/search and design review is pending. Full verify is running under /private/tmp/zaafran-search-verify.log, session 30779. No feature push yet.
- 2026-11-08 · High · Search passed full verify with 1,579 unit and 234 PostGIS cases, plus both ar/fr production journeys. Reviewer closed the work-bound P1 and design critic passed eight captures. Performance benchmark and complete ranking remain open.
- 2026-11-08 · High · Mahdi targets half the overall scope by 22:00 London today. Measure against SPEC acceptance, with customer restaurant/item/cart journey the next implementation batch. This is a target, not verified completion.
- 2026-11-08 · High and ultra · Resumed restaurant/item/cart batch after search push. Lane A merged verified main at `28db669`. Contract builder owns restaurant schemas; cart builder owns domain logic. Root will wire public repository/API against committed schemas. Frozen integrated install is running in session 82967.
- 2026-11-08 · High · Public menu contract committed at `86269ca`. Root added three anonymous restaurant routes, policy inventory and revision error mapping. Eleven focused HTTP/inventory tests and API typecheck passed. Repository writer is reusing preview visibility safely; cart builder has 39 green cases. Next connect production repository and start restaurant UI.
- 2026-11-08 · High · Added localized /restaurants/[slug] page entries and public client reads while repository and UI builders continue. Cart core committed separately after 290 domain tests. Root API start now uses public restaurant repository, awaiting its private-preview regression completion. Unfinished batch is unpushed.
- 2026-11-08 · Ultra review · Restaurant reviewer found category serving windows were omitted from item availability. DB builder is adding shared Algiers-time window checks and boundary regressions before this batch can close. Public item-photo and route inventory tests pass 12 cases. Feed links pass 12 web cases; production item/cart journey is authored.
- 2026-11-08 · High · Feed/search results now link to localized restaurant pages, with 12 web tests passing. Item/cart browser proof asserts required sauce blocks Add, two configured units total 1,100 DZD, and cart survives reload. UI and review fixes still in flight; no full batch push yet.
- 2026-11-08 · Ultra · Full route authorization matrix passed 228 tests after public menu and photo wiring. DB builder reports both review fixes green across 24 relevant PostGIS cases; waiting final suite and independent re-review. UI build remains active; production item/cart test is ready.

- **M3 public menu review (ultra).** Fixed Algiers serving-window boundaries and blocked
  prohibited option names across list, detail and photo reads. Independent reviewer reran
  24 PostGIS tests successfully. Opened a P1 for stale menu revision recovery.


- 2026-11-08 · Ultra review · Main CI repair pushed at `5564a30` after full verify
  (1,701 unit and 222 PostGIS tests) and all 65 smoke cases passed. The repair
  isolates codec inputs and locale navigations into their existing per-test budgets.

- 2026-11-08 · Ultra review · The menu now carries its category revision into item detail and
  recovers from stale item or pagination reads. The cart preserves another tab’s renewal
  when an older expiry timer fires. Both production browser regressions passed.

- 2026-11-08 · High · Eight focused production discovery/cart cases and all 30 authenticated
  browser cases passed. The bilingual journey selects a commune, searches, configures a
  required option, checks the 1,100 DZD total, and reopens the saved cart after reload.

- 2026-11-08 · High · Design critic approved the 48 restaurant/item/cart captures at
  390×844, 768×1024 and 1280×800, ar/fr and light/dark. The item CTA stays visible in its
  own footer. M3-4 and M3-5 remain open for ETag, restaurant information and cart merchandising.

- 2026-11-09 · High · Feed and menu now revalidate serialized public JSON with ETags.
  Fresh reads preserve availability, moderation and revision errors. Full verify passed
  (1,787 unit and 253 PostGIS), and all three focused production journeys passed.

- 2026-11-09 · Medium · Arabic, French and English discovery now advertise the customer
  manifest and saffron app icons. Production Chromium reproduced the missing manifest and
  passed after wiring it. Offline, push and low-data behavior remain open.

- 2026-11-09 · Medium review · Fixed the PWA launch P1 with localized discovery URLs
  and one stable app ID. Four production Chromium checks passed. The M3 gate now
  dispatches discovery and the scale benchmark, with 17 gate tests passing.

- 2026-11-09 · Ultra · Search at 500 restaurants and 30,000 items timed out before the
  SQL planner fix. Fresh-index p95 is now 65.5 ms over 22 golden queries with synonyms.
  All 12 focused PostGIS tests passed. Evidence is in `docs/evidence/m3/search-scale.md`.

- 2026-11-09 · High · The customer offline fallback caches only localized public pages and CSS.
  Three production tests proved disconnect, locale, private-route bypass and recovery.
  Twelve captures are in `docs/evidence/m3/offline/`. Recent menus and push remain open.
- 2026-11-09 · High · The M3 gate and CI now run the search benchmark in isolation.
  This keeps the unchanged 120 ms budget independent of parallel codecs and database fixtures.
  The dedicated command passed at 67.4 ms p95.

- 2026-11-09 · Medium · Customer photos use smaller variants when Save-Data is sent
  or the browser requests it. Both production browser cases passed. Merged the green
  merchant-photo CI repair into main at `c39cfc2` and brought it into lane-a.

- 2026-11-09 · Ultra · Closed Lane B privacy request and merged `8757454`. Account-bound
  OTP, rate limits, audit, anonymization, media erasure, and exact deletion replay are wired.
  Full verify passed (1,808 unit, 269 PostGIS), with 234 authz and two production privacy cases.

- 2026-11-09 · Medium/high · Added the team preview with synthetic restaurant discovery, cart,
  Arabic RTL, partner/admin examples, and 3D/motion studies. Three Node 24 browser cases passed.
  Eight visual captures are in `docs/evidence/team-preview`; Vercel setup is in `docs/TEAM_PREVIEW.md`.

- 2026-11-11 · Low · Updated sprint ownership and sequence. Lane A now owns the restaurant board, courier and admin screens, and e2e.
  Next: publish the tested order, quote, address, tracking, courier and feed contracts.

- 2026-11-11 · High · Published order, quote, address, tracking, courier and feed schemas in AWID_CONTRACTS.md. All 196 contract tests, typecheck, build and lint passed.
  Next: persist addresses and server-priced quotes, then place and transition orders transactionally with the acceptance job before wiring feed filters.

- 2026-11-11 · High · Added scoped address CRUD, PostGIS serviceability, Plus Codes, one default, privacy export and erasure. 544 package tests and 17 focused PostGIS tests passed.
  Next: persist server-priced quotes using current merchant zones and menu snapshots, then place orders and enqueue expiry in one transaction. Private voice uploads remain pending.

- 2026-11-11 · High · Added cash quote pricing from validated menu options and whole-DZD zone fees, with zero-fee pickup. All 297 domain tests, build, lint and typecheck passed.
  Next: store the account-bound quote with a 10-minute expiry; resolve current menu availability, delivery zone and order modes before writing.

- 2026-11-11 · High · Added ten-minute checkout quotes with pickup, scoped addresses, live menu pricing, zone fees, slot checks, and quote cleanup. 661 package tests and 254 PostGIS tests passed.
  Next: add idempotent order placement with quote revalidation, write the order snapshot and event, and enqueue the acceptance timer in the same transaction.

- 2026-11-11 · Ultra · Implemented quote revalidation and idempotent placement with snapshots, event and Graphile timer in one transaction. Passed 662 package tests, 263 integrations and 239 authz tests.
  Next: add scoped reads and versioned customer and merchant transitions, then feed filters and sorting.

- 2026-11-11 · Ultra · Added scoped order reads and versioned, idempotent customer, merchant and admin actions. Passed 663 package tests, 268 integrations and 240 authz tests.
  Next: implement feed metadata, filters and stable sorting, then build the merchant order board against these actions.

- 2026-11-11 · High · Implemented discovery ratings, ETA and fee metadata, URL filters and stable sorting by distance, rating and ETA. Passed 352 package tests and 271 PostGIS and worker integration tests.
  Next: add the scoped merchant board snapshot and durable replay cursor, then wire the live board screens.

- 2026-11-11 · High · Published the tenant-scoped merchant board snapshot and commit-ordered replay. Passed 549 package tests, 33 focused PostGIS tests and 242 authz tests.
  Next: build the localized board with polling, sound, countdowns and order actions. SSE and courier handover follow their sprint slices.

- 2026-11-11 · High · Shipped the localized merchant board with polling replay, cash detail, actions, countdown, audio, wake lock and offline state. 829 unit and six production browser tests passed. Screenshots in docs/evidence/awid/merchant-board/.
  Next: wire merchant handover for assigned couriers, then add SSE with polling fallback, push and SMS.

- 2026-11-11 · High · Wired merchant handover from Ready for deliveries with an assigned courier. Passed 19 lifecycle integrations, 242 authz tests and seven production browser checks.
  Next: stream merchant order events over SSE with cursor resume and polling fallback, then wire customer status notifications.

- 2026-11-11 · Ultra · Added merchant SSE with durable cursor resume, PostgreSQL wakeups, live-session checks and polling fallback. Passed 553 package tests, 274 integrations, 244 authz tests and eight production browser checks.
  Next: add order-status notifications and configure the SMS adapter, then build the courier API and screens. Verify stream buffering on the deployed proxy.

- 2026-11-11 · High · Added authenticated single-order SSE with version replay and Postgres notifications. Passed 552 package tests, 245 authz tests and 21 focused PostGIS tests.
  Next: queue customer order-status web push and SMS from committed transitions, then implement courier assignment, jobs and live positions.

- 2026-11-11 · High · Queued terminal order SMS atomically and added a retry-safe HTTPS gateway with ar/fr/en checkout locale. Passed 213 package tests and 26 PostGIS and Graphile integrations using a fake gateway.
  Next: persist session-scoped web push subscriptions and queue push on order transitions. Real SMS credentials are listed in HUMAN_TODO.md.

- 2026-11-11 · High · Added session-scoped browser push registration and opt-out, trusted endpoint validation, device caps and erasure. Passed 555 package tests, 246 authz and 17 PostGIS integrations.
  Next: send order status updates over VAPID, prune expired subscriptions and publish the public key contract.

- 2026-11-11 · High · Added localized VAPID order notifications with web-push 4.0.0, idempotent worker delivery, expired endpoint cleanup and the public key API. Passed 560 package tests, 247 authz and 27 integrations.
  Next: fix real standard-session merchant board authorization, then implement courier invitation, assignments and jobs. Browser opt-in remains a Lane B task.

- 2026-11-11 · Ultra · Fixed board, order actions and SSE authorization for real standard session cookies. A full API/PostGIS regression proves staff membership, buyer ownership and outsider denial. Passed 280 integrations, 247 authz and dependency checks.
  Next: persist phone-bound courier invitations and membership, then wire assignment and jobs.

- 2026-11-11 · Ultra · Added phone-bound courier invitations, one-restaurant membership, presence and tenant roster. Passed 248 authz, 17 PostGIS onboarding/privacy checks, scoped typecheck/lint and dependency checks.
  Next: wire roster assignment and assigned jobs. Owners currently share invite links manually.

- 2026-11-11 · Ultra · Added tenant-safe, idempotent courier assignment, assigned jobs with exact pins and cash, and assigned-driver pickup. Passed 24 PostGIS cases, 248 authz, scoped lint/typecheck and OpenAPI checks.
  Next: validate, rate-limit and publish courier positions for live tracking. Jobs return a null first name until customer profiles collect it.

- 2026-11-11 · Ultra · Added active-driver GPS intake with timestamp, distance, speed and Algeria bounds checks, per-driver throttling, commit-time notifications and 30-day expiry. Passed 37 PostGIS and 13 focused API/unit tests plus scoped lint/typecheck.
  Next: serve the buyer’s scoped tracking view and SSE position updates, then add delivery confirmation.

- 2026-11-11 · Ultra · Added buyer-only pickup/delivery tracking and live position frames without changing the order replay cursor. Passed 249 authz, 23 PostGIS checks, and scoped typecheck/lint/OpenAPI.
  Next: add four-digit delivery proof and retry-safe attempt limits; share links and routed ETA are still pending.

- 2026-11-11 · Ultra · Added buyer-only four-digit proof, stored keyed digests, five-try lockout and idempotent successful and failed submissions. Passed 250 authz, 38 PostGIS, and scoped unit/typecheck/lint/OpenAPI checks.
  Next: implement server-timed failed delivery and photo proof fallback before the courier screens.

- 2026-11-11 · Ultra · Added assigned-courier wait and call records, replay-safe counting and the failed-delivery transition with server-side ten-minute and two-call guards. Passed 250 authz and 38 PostGIS checks.
  Next: bind private photo proofs to an active order and surface their flag to the merchant, then build courier screens.

- 2026-11-11 · Ultra · Added private, order-bound delivery photo proofs, a merchant review flag and retryable 30-day/erasure cleanup. Passed 304 integrations, 250 authz and scoped lint/typecheck, plus the focused merchant photo-access regression.
  Next: build the localized courier screens and add assignment, invite sharing and proof review to the merchant board.

- 2026-11-11 · Medium · Built localized courier invitations, job cards, availability, cash details, exact-pin navigation and slide-to-pickup. Five production-browser cases and 44 localization tests passed. Four inspected screenshots are in docs/evidence/awid/courier-pickup/.
  Next: add foreground location sharing and code/photo/failed drop-off controls, then wire assignment and proof review into the merchant board.

- 2026-11-11 · High · Connected foreground GPS with in-memory batching, delivery codes, private fallback photos and wait/call controls. Eight production-browser checks and 46 unit/localization tests passed. Inspected layouts in docs/evidence/awid/courier-dropoff/.
  Next: wire merchant invitation, assignment and proof review into the board, then move to nationwide maps. Courier voice notes still need private audio.

- 2026-11-11 · Medium · Connected owner invite links, courier assignment, live handover readiness and private delivery proof review to the board. Passed 18 production-browser checks, 23 PostGIS cases and 51 scoped unit checks.
  Next: implement OSRM routing with fallback, nationwide location selection and the national seed.

- 2026-11-11 · High · Added private OSRM tracking routes, thirty-second ETA coalescing and distance fallback with a circuit breaker. Passed 60 scoped tests. Pinned OSRM Docker returned 14 points, 874 m and 91 s on the Algiers fixture.
  Next: publish all 69 wilayas to location pickers and wire the national map and seed data. Production still needs the full Algeria road graph.

- 2026-11-11 · Medium · Published the anonymous bilingual wilaya directory and documented per-wilaya commune pagination. All 69 sorted codes were checked on PostGIS. Passed 15 API and three geography integration checks.
  Next: connect the catalog to location selectors and prepare the pinned nationwide map, route and boundary data.

- 2026-11-11 · High · Connected nationwide wilaya and commune selection and verified 1,541 PostGIS boundaries, seven real browser checks, 23 PostGIS checks and 54 scoped tests. Martin and OSRM served the pinned Algeria datasets.
  Next: display the self-hosted basemap, add exact pin selection, then seed eight cities and enable merchant radius controls.

- 2026-11-11 · High · Added lazy Algeria basemap to discovery and courier. Four production-browser map checks, 56 scoped tests, lint, typecheck and dependency boundaries passed. Reviewed captures in docs/evidence/awid/location-map/.
  Next: replace merchant typed coordinates with the same pin control, seed eight cities, and wire merchant radius settings.

- 2026-11-11 · Medium · Replaced merchant coordinates with a commune-centred pin, GPS accuracy, and localized validation. Passed 66 scoped checks, three real merchant/admin journeys and four production-map checks.
  Next: expand the local-only catalog to 40 fictional restaurants across eight cities with cover photos and reviews.

- 2026-11-11 · Medium · Seeded 40 fictional restaurants across eight cities with 200 bilingual dishes, item and cover variants and 120 anonymous reviews. Four PostGIS checks passed, including repeat seeding and storage failure rollback.
  Next: publish the merchant delivery-radius contract and wire it to quote coverage, then prepare production Compose and Vercel.

- 2026-11-11 · Medium · Published merchant delivery settings schemas. Contract cases cover the radius bounds, required radius for delivery, invalid money, pickup and legacy reads.
  Next: implement the transactional settings repository, authorization matrix, API and merchant controls against this contract.

- 2026-11-11 · Ultra · Added transactional merchant radius and modes, scoped reads and revision-bound replay. Passed 253 authz and HTTP cases, 32 real PostGIS cases and OpenAPI validation. Exact addresses inside and outside the radius resolved correctly.
  Next: connect the settings screen to this API with conflict recovery, then start production deployment preparation.

- 2026-11-11 · Medium · Shipped the merchant delivery settings screen with radius and fees, save feedback and stale-draft recovery. One production HTTPS/PostGIS journey, four axe/overflow checks and 57 scoped tests passed. Captures in docs/evidence/awid/merchant-delivery/.
  Next: prepare the backend Compose image, TLS, migrations, backups and Vercel wiring. Hosted checks need a staging server and linked web project.

- 2026-11-11 · High · Built the production Compose stack and passed a trusted local Caddy HTTPS smoke. Restored the encrypted PostGIS dump and synthetic private media. Knip and dependency boundaries passed.
  Next: wire the configurable authentication SMS provider, then implement admin live orders and its two handoffs while Mahdi provisions the server and Vercel project.

- 2026-11-11 · Ultra · Wired the authentication SMS webhook for OTP, privacy and staff invites, with scoped stable invite retries and sanitized provider failures. Passed 62 scoped tests, 50 PostGIS cases and five production-browser auth/staff journeys.
  Next: publish admin live-order search and timeline contracts, then wire the admin tools and complete the two handoffs.

- 2026-11-11 · Medium · Published private admin live-order search and timeline schemas. Three contract cases passed for cursor bounds, exact phone search and the PII-free response shape.
  Next: add indexed Postgres search and audit, API authorization rows, then the live admin screen.

- 2026-11-11 · Ultra · Added admin-only indexed live search and bounded timelines, session-bound force commands and exactly-once audit rows. Passed 255 authz/HTTP tests, 24 PostGIS cases and OpenAPI validation.
  Next: implement and verify the admin order console, then connect the merchant notice and moderation token handoffs.

- 2026-11-12 · Medium · Shipped admin live orders, merchant application notices and repeat-moderation review tokens. Six production-browser journeys and 83 scoped tests passed. Screenshots and layout notes in docs/evidence/awid/admin-orders/.
  Next: integrate Lane B and close the real customer history, receipt, rating and tracking gaps before running the order journeys.

- 2026-11-12 · High · Added private order history and receipts on the existing contract, with precise cursor paging and active-session scoping. Passed 256 authz/HTTP tests and three PostGIS cases. OpenAPI matches.
  Next: implement the customer rating read and write against the published contract, then exercise delivery and pickup against real routes.

- 2026-11-12 · Ultra · Added session-scoped customer ratings for delivery and pickup with 24-hour edits, exactly-once retry, expiry cleanup, privacy export and erasure. Passed 257 authz/HTTP, 19 PostGIS and 12 API-schema and merchant-form checks.
  Next: run the real delivery, pickup, rejection, expiry and cancellation journeys on the integrated build, then complete the restaurant reviews handoff.

- 2026-11-12 · High · Added private favourites with idempotent writes, publication checks, an account cap and deletion cleanup. Passed 20 PostGIS and 11 HTTP/authz/schema checks.
  Next: integrate the favourites API into route smoke and add the public and merchant reviews reads.

- 2026-11-12 · High · Added anonymous public restaurant reviews and owner/manager review reads with stars and precise cursors. Six PostGIS and 11 HTTP/authz/schema tests passed.
  Next: add merchant analytics and the admin dashboard API for route smoke. Review replies and reports remain open.

- 2026-11-12 · High · Added live merchant analytics and the admin dashboard with indexed Algiers-day aggregates and worker backlog. The error rate covers requests observed by the current API process. Seven PostGIS and 11 HTTP/authz/schema checks passed.
  Next: merge the analytics API into the production route sweep, then finish the remaining design and release checks.

- 2026-11-12 · High · Integrated customer SSE tracking and the Algeria basemap. Five real production-browser journeys passed with PostGIS: delivery and GPS, pickup, rejection, expiry and cancellation. Delivery and pickup cover rating and receipt.
  Next: finish the production route sweep across Arabic and French, then run full verification and the merchant, courier and admin design pass.

- 2026-11-12 · Medium · Added Arabic routes for the full admin console and localized TOTP return paths. Passed the four production route smoke runs across Arabic and French at 390 and 1280 px with real role sessions and PostGIS.
  Next: merge the latest Lane B design work, run full workspace verification and capture the final partner and admin layouts.

- 2026-11-12 · High · Added tenant-scoped merchant review replies and report submissions, with a 24-hour reply window and keyed replay. Passed 261 authz/HTTP and 23 PostGIS cases. Reports are retained for admin review.
  Next: integrate review commands into the release candidate and verify the final partner/admin design and release gates.

- 2026-11-12 · High · Finished two AWID design rounds on the live board, courier pickup and drop-off, and admin live orders. Passed 21 production-browser checks, including axe and overflow across 20 captures. Registered the screens in the design gallery.
  Next: run full verification and the browser release suite, fix findings, then begin the phone and email sign-in handoff.

- 2026-11-12 · Ultra · Reproduced the nationwide geography findings and corrected the Oran boundary fixture to expect its official commune. Gave the full 1,541-boundary reseed test an explicit harness timeout. All nine focused PostGIS cases and trace passed.
  Next: rerun the full release checks and browser suites against the integrated build.

- 2026-11-12 · Ultra · Isolated three release-suite timeouts to contention between concurrent PostGIS clones. All 314 integration tests passed with four workers. Pinned that concurrency for the shared database.
  Next: complete the full verification run and both browser suites on the release candidate.

- 2026-11-12 · Medium · Matched the mobile language control’s accessible name to its visible label and updated browser assertions for localized admin links, item options and the mobile cart. All 13 affected production-browser checks passed across the focused reruns.
  Next: rerun the complete release and browser suites before merging the release candidate.

- 2026-11-12 · High · Fixed the dark landing contrast and ran browser schemas without CSP-blocked code generation. Verified the map on Chromium and WebKit, offline caches and the responsive locale menu. Full verify passed with 1,961 unit and 314 PostGIS cases. Browser suites passed 68 authenticated and 98 general cases.
  Next: use this release commit for a protected Vercel preview and backend staging when the host and provider credentials are available. Continue phone/email checkout and screens on lane-a.

- 2026-11-12 · Ultra · Published additive phone/email OTP, identity linking and checkout contact contracts after merging the latest Lane B screens. All 207 contract tests, typecheck, build and lint passed.
  Next: extend the existing OTP transaction and rate limit to email, then verify ten-minute expiry, lockout and email TOTP against PostGIS.

- 2026-11-12 · Ultra · Extended phone OTP to normalized email with ten-minute expiry, shared IP quotas and admin TOTP. Passed 32 PostGIS cases, 55 scoped unit/HTTP checks, DB/API typecheck, lint and OpenAPI check.
  Next: extend privacy export and erasure to email and bind identifier changes to an active session. Production email remains disabled pending checkout and privacy support.

- 2026-11-12 · Ultra · Added both verified identifiers to privacy export and erasure, and sent deletion OTP by email for email-only accounts. Passed 16 PostGIS privacy cases and 10 HTTP/service/contract cases, plus API/DB typecheck, lint and OpenAPI.
  Next: bind add/change OTP to the issuing account and session and enforce exclusive ownership at confirmation.

- 2026-11-12 · Ultra · Added enabled methods, verified identifier reads and session-bound add/change routes. Confirming an identifier already in use leaves both accounts intact. Passed 50 PostGIS cases, 55 authz/service cases, DB/API typecheck, lint and OpenAPI.
  Next: configure Twilio and Resend delivery with localized messages and inspectable development outboxes.

- 2026-11-12 · Ultra · Wired localized AWID OTP messages through Twilio, the existing webhook and Resend. Added the loopback email outbox and documented private provider settings. Passed 21 adapter/config/privacy cases, API typecheck, lint and OpenAPI.
  Next: preserve the cash cap for email-only checkout and store the unverified contact number only with its order.

- 2026-11-12 · Ultra · Enabled email-only quotes and placement with a separate order contact. Merchant and courier reads are scoped, the cash cap still applies, and privacy export and erasure cover the contact. Passed 40 PostGIS and 107 domain/HTTP cases plus API, DB and web typecheck.
  Next: finish the dual-method sign-in screen, then connect account identifier changes and checkout contact entry.

- 2026-11-12 · High · Connected the phone/email sign-in picker, verified account contact editor and email-only checkout contact. Passed 45 scoped UI checks and eight production-browser journeys. Saved 12 captures after two design rounds and added gallery links.
  Next: finish the invitation and push-first notification checkpoint, then integrate the verified release baseline and rerun the full gate.

- 2026-11-12 · Ultra · Completed phone/email invitations and push-first order notices. Notices fall back to verified SMS or email and never use checkout contact data. Passed 99 focused PostGIS cases, 262 authorization/HTTP checks, lint, typecheck and OpenAPI.
  Next: merge the verified main baseline, run full verification and both production-browser suites, then publish the auth phase. Live provider and staging steps remain in HUMAN_TODO.

- 2026-11-12 · Ultra · Integrated Lane B Discovery and Search, corrected invitation browser assertions and AWID font checks, and fixed CI budgets for production startup and national seeding tests. Passed pnpm verify (1,976 unit and 326 PostGIS), 72 authenticated and 98 general production browser checks, and a trusted HTTPS Docker upgrade.
  Next: check the exact Lane A release on GitHub before advancing main. Continue with the open Discovery feed request, and use HUMAN_TODO for hosted staging and live provider verification.

- 2026-11-12 · High · Fixed horizontal overflow in checkout, merchant delivery settings, promotions and share kit, and admin billing and platform. Reproduced all seven GitHub failures with the pinned Linux Chromium and passed all nine targeted production-browser tests on the fix. Reviewed the Arabic mobile checkout and delivery screens.
  Next: wait for GitHub CI on this patch before advancing main. Hosted staging and live providers still need the inputs in HUMAN_TODO.

- 2026-11-12 · High · Kept nationwide seed photo encoding results for repeats in the same process. PostGIS still proves 40 stable restaurant identities, rollback on storage failure, and republishing a missing photo. The focused run fell from 12.48s to 8.36s locally.
  Next: wait for the updated GitHub run and advance main only after all checks pass.

- 2026-11-12 · Ultra · Released phone and email sign-in and Lane B Discovery/Search to main at `758f845`. [Hosted CI](https://github.com/Mahdi-Lalioui/delivery/actions/runs/43230946494) and CodeQL passed on that exact commit before the fast-forward, including mutation and authenticated browser tests.
  Next: handle [Lane B's Discovery feed request](../requests/lane-b-discovery-feed.md). Hosted staging and live SMS/email verification need the server, Vercel project and provider inputs in HUMAN_TODO.

- 2026-11-12 · High · Integrated Lane B's search URLs, dish sheet and cart transitions, and 3D tracking. Mounted AWID's tagine after live checkout with low-data and reduced-motion paths. Workspace verification passed with 1,997 unit and 326 PostGIS tests. Reviewed [five confirmation captures](../evidence/awid/order-confirmed/README.md) and verified real delivery, pickup and search history.
  Next: finish browser and GitHub checks on the integration branch before advancing main. Continue the Discovery feed and reorder handoffs from docs/requests.

- 2026-11-12 · High · Added delivery-fee ordering and approximate commune distance to the public feed. PostGIS verifies fee order across cursors, unknown fees last, and omission without a commune. Passed five contract tests, nine focused PostGIS tests and full pnpm verify.
  Next: keep this slice on `codex/awid-discovery-contract` until the motion PR is merged, then connect the saved commune and fee choice in the Discovery UI. Pickup, scheduling and reorder are still open.

- 2026-11-12 · Medium · GitHub CodeQL flagged HTML tag stripping in a restaurant price test. Replaced it with direct assertions for the accessible amount and the hidden animated digits. All 11 component cases, lint and formatting passed.
  Next: verify the consolidated motion and fee API release on PR #6 before advancing main. PR #7's Discovery commits are included in that candidate.

- 2026-11-12 · Medium · GitHub cancelled the serial Verify job at its 20-minute limit during authenticated browser checks. Moved mutation testing to a parallel CI job and made it a required PR check. All 16 release-gate tests passed and the product's 170 local browser checks were already green.
  Next: check the exact new PR #6 head and advance main once Verify, Domain mutation, browser smoke and CodeQL pass.

- 2026-11-12 · High · Fixed the Arabic restaurant's 17 px horizontal overflow on Linux Chromium by allowing the menu and full-bleed header grids to shrink. Reproduced the failure, then passed all four Arabic/French route matrices and both restaurant cart journeys on Linux.
  Next: finish the hosted gate on this exact layout patch before advancing main.
