# AWID local readiness

Deployment is paused. Check an item only when its evidence is linked beside it. Record the tested commit, commands, environment and result. Use synthetic data for all local drills.

## Customer experience

- [x] **Lane A** Consistent dish and cover pipeline with crop ratios, warm grade, contrast and sharpening, and published restaurant guidance. Crop/style regression (11 tests) and media typecheck passed; dishes and covers use the same grade while logos retain original colour. [Photo guide](RESTAURANT_PHOTOS.md) · [Verification evidence](evidence/awid/photo-pipeline.md)
- [x] **Lane B** Review the photo catalogue and replace weak or off-style images. Two uncredited images and three weak or mislabelled ones were replaced with licensed, graded Wikimedia Commons photos, and a test checks that every catalogue photo is credited. [Review](evidence/awid/photos/README.md)
- [x] **Lane B** Short haptics for add-to-cart, order placement and acceptance. Optional acceptance sound, mute preference and reduced-motion support. [Haptics and mute note](evidence/awid/feel/README.md) (393969e)
- [x] **Lane B** Arabic, French and English copy pass. Errors give the customer a next step. [Copy changes](evidence/awid/copy.md) (17a477c)
- [x] **Lane B** Audit spacing, type, radii, shadows, icons, buttons and colours on every customer screen. Record and fix deviations in `docs/evidence/awid/consistency.md`. [Consistency list, 21 fixed](evidence/awid/consistency.md) (fb5d002)
- [x] **Lane B** Remove content that distracts from the next action. Verify one focal point per screen. [Screen-by-screen verdicts, before and after](evidence/awid/reduce/README.md)
- [x] **Lane B** Verify 44 px touch targets, visible focus, meaningful labels, contrast in both themes and keyboard journeys. [Audit rounds 1–5 and keyboard journeys](evidence/awid/a11y/README.md): 0 axe violations, 0 small targets, 0 invisible focus on 15 routes × 4 variants
- [x] **Lane B** Complete the final visual review on every customer screen. Record shortcomings, fixes and fresh captures. [Jury rounds 1–3: shortfalls, fixes and captures](evidence/awid/jury/README.md)

- [x] **Lane B** Maps in AWID colours with page-language labels, branded pin cards with clustering, retry inside the fallback; real streets and buildings on a production build with the national extract. [Screenshots and notes](evidence/awid/maps/README.md) (5afa5d3)
- [x] **Lane B** No restaurant named "Démo" on any branch. [Request closed](requests/lane-b-realistic-demo-names.md)
- [x] **Lane B** Design and capture every state of every customer screen: loading, empty, error, offline, slow network, closed restaurant, sold-out dish, expired cart, offer no longer valid, cancelled or rejected order. [State table, flaws fixed and 116 captures](evidence/awid/states/README.md)
- [x] **Lane B** Offer badges in Discovery and the promo code field in checkout, designed and captured. [Design notes and captures](evidence/awid/offers/README.md)


## Performance and offers

- [x] **Lane B** Connected Discovery LCP below 2 s on the established throttled Android profile. Connected 1,488–1,628 ms; richer preview catalogue 1,484–1,600 ms (ar 1,760–1,832 ms); CLS 0. [Evidence](evidence/awid/perf.md#lane-b-initial-js-under-180-kb-and-connected-lcp-18-november-2026)
- [x] **Lane B** Connected Restaurant LCP below 2 s on the same profile. Connected 1,440–1,476 ms; richer preview catalogue 1,912–1,920 ms (smallest margin); CLS 0. [Evidence](evidence/awid/perf.md#lane-b-initial-js-under-180-kb-and-connected-lcp-18-november-2026)
- [x] **Lane B** Customer tap feedback within 100 ms, with optimistic feedback where safe. [Worst tap 72 ms on the throttled Android profile](evidence/awid/perf.md#customer-feel-taps-frames-and-layout-shift-lane-b-13-november-2026)
- [ ] **Lane B** Measure 60 fps scrolling and animation and CLS below 0.05. Defer offscreen images and 3D. Record connected results in [performance evidence](evidence/awid/perf.md). CLS 0 and 60 fps on Discovery, Restaurant and Checkout; Tracking scroll measured 59–60 fps with opt-in 3D. Connected tilt measured 53 active fps in three national-map runs, below the target. [Tilt evidence](evidence/awid/perf.md#connected-tracking-tilt-20-november-2026). [Results](evidence/awid/perf.md#3d-street-view-on-tap-13-november-2026-lane-b)
- [x] **Lane B** Route bundle budgets enforced in CI at the SPEC target. Initial JS 135–164 KB gzip on the five customer routes; `e2e/customer-bundle-budget.spec.ts` fails above 180 KB. [Evidence](evidence/awid/perf.md#lane-b-initial-js-under-180-kb-and-connected-lcp-18-november-2026)
- [x] **Lane A** Quote and placement honour code and automatic offers and apply the published stacking rules. [PostGIS quote and placement tests](../packages/db/test/order-quotes.integration.test.ts)
- [x] **Lane A** Per-customer and global offer limits and idempotent redemption hold under retries and concurrency. [PostGIS redemption tests](../packages/db/test/order-quotes.integration.test.ts)
- [x] **Lane A** Discovery offers filter and badge data match redeemable offers. [PostGIS public feed tests](../packages/db/test/public-feed.integration.test.ts)

## Security

- [x] **Lane A** Review SPEC §17 and AGENTS §10. The authorization matrix exercises all registered routes by role. Connected Postgres cases verify customer and merchant ownership, including resource binding and live stream revocation. [142-route evidence map](evidence/awid/tenant-endpoint-map.md)
- [x] **Lane A** Verify OTP enumeration resistance, attempt caps and SMS/email delivery limits by identifier, IP and signed-in account. [Connected auth and Postgres regressions](SECURITY_REVIEW.md#otp-abuse-and-delivery-limits) (8b1675c plus account-limit change below)
- [x] **Lane A** Verify upload type, size, decompression limits and metadata stripping. [Upload validation evidence](SECURITY_REVIEW.md#upload-validation)
- [x] **Lane A** Verify input handling, CSRF, CSP and security headers, session fixation protections and revocation. The focused API boundary suites passed 60/60, connected Postgres auth passed 12/12, and production HTTPS smoke plus upstream failure header checks passed. [Evidence](SECURITY_REVIEW.md#input-and-browser-security-signoff).
- [ ] **Lane A** Review route rate limits, secret handling and dependencies. The route-family inventory records the shared 120/IP/minute API limit and durable OTP, deletion-challenge and courier limits; the proxy identity regression and production advisory gate passed. Multi-replica protection and live provider spend controls remain open. [Rate-limit inventory](evidence/awid/rate-limits.md)
- [x] **Lane A** Record findings and their regression evidence in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). The report links observed defects and fixes to regression evidence and lists the unverified security scope separately.

## Local production reliability

- [x] **Lane A** Complete delivery and pickup against local production Compose with customer, restaurant and courier as applicable. [HTTPS pickup and delivery drills](evidence/awid/local-operations.md#https-pickup-and-idempotent-recovery)
- [x] **Lane A** Restart API, worker and database mid-order. Prove orders and transitions are neither lost nor duplicated. [Restart and replay evidence](evidence/awid/local-operations.md#https-delivery-and-idempotent-recovery)
- [x] **Lane A** Disconnect and reconnect the restaurant board and courier. Verify event replay and SSE reconnection. [Connected browser drill](evidence/awid/local-operations.md#connected-browser-network-recovery)
- [x] **Lane A** Verify timers have one observable effect across retries and restarts. [Expiry and release drills passed](evidence/awid/local-operations.md#pending-order-and-timer-restart)
- [x] **Lane A** Run k6 for placement and courier position intake at 10× expected pilot load. The 100-restaurant connected fixture passed at 12.73/4.09 ms p95 with no errors or drops. The single-restaurant stress case failed and is documented separately. [Connected results](evidence/awid/k6/connected-pilot.md).

## Operations and release verification

- [x] **Lane A** Verify health checks and structured logs without personal data. Web, API, worker, Caddy and Martin health are covered in the [local Compose evidence](evidence/awid/web-compose-local.md); [API, Caddy and PostgreSQL probes](SECURITY_REVIEW.md#api-and-postgresql-log-privacy) and the [worker logger regression](SECURITY_REVIEW.md#worker-log-privacy) pass.
- [ ] **Lane A** Verify error tracking and alerts through test incidents. A terminal Postgres worker incident reached synthetic Telegram and Resend receivers once each. A synthetic API 500 emits a privacy-safe event. Live Telegram and Resend delivery and external collector ingestion remain open. [Local alert evidence](evidence/awid/ops-alerts.md)
- [x] **Lane A** Complete the SPEC §20 runbooks for deploy, rollback, restore, Ramadan peak, API down, DB full, SMS down, tiles down, OSRM down and restaurant complaint surges. [Runbooks](runbooks/service-incidents.md)
- [x] **Lane A** Keep the encrypted restore drill green with fresh evidence. [Local restore results](evidence/awid/local-operations.md)
- [x] **Lane A** Integrate Lane B regularly. Require full `pnpm verify` and every browser suite green in GitHub CI before merging. [Exact integration run](https://github.com/Mahdi-Lalioui/delivery/actions/runs/44093493915) (`f1febe7`)
- [ ] **Lane A** After all preceding Lane A criteria pass, rerun security and reliability from scratch and record the result.
