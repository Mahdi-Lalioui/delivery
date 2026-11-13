# AWID local readiness

Deployment is paused. Check an item only when its evidence is linked beside it. Record the tested commit, commands, environment and result. Use synthetic data for all local drills.

## Customer experience

- [ ] **Lane A** Consistent dish and cover pipeline with crop ratios, warm grade, contrast and sharpening. Review the catalog, replace weak images and publish restaurant guidance. [Photo guide](RESTAURANT_PHOTOS.md)
- [x] **Lane B** Short haptics for add-to-cart, order placement and acceptance. Optional acceptance sound, mute preference and reduced-motion support. [Feel evidence](evidence/awid/feel/README.md)
- [x] **Lane B** Arabic, French and English copy pass. Errors give the customer a next step. [Copy evidence](evidence/awid/copy.md)
- [x] **Lane B** Audit spacing, type, radii, shadows, icons, buttons and colours on every customer screen. Record and fix deviations in `docs/evidence/awid/consistency.md`. [Consistency evidence](evidence/awid/consistency.md)
- [ ] **Lane B** Remove content that distracts from the next action. Verify one focal point per screen.
- [ ] **Lane B** Verify 44 px touch targets, visible focus, meaningful labels, contrast in both themes and keyboard journeys.
- [ ] **Lane B** Complete the final visual review on every customer screen. Record shortcomings, fixes and fresh captures.

- [x] **Lane B** AWID maps with localized labels, pin cards, clustering and a fallback. [Map evidence](evidence/awid/maps/)
- [x] **Lane B** Fictional restaurant display names. [Seed and preview evidence](requests/lane-b-realistic-demo-names.md)
- [ ] **Lane B** Verify designed loading, empty and error states on every customer screen.

## Performance and offers

- [ ] **Lane A** Connected Discovery LCP below 2 s on the established throttled Android profile. [Small-fixture samples](evidence/awid/perf.md#connected-production-build)
- [ ] **Lane A** Connected Restaurant LCP below 2 s on the same profile. [Small-fixture samples](evidence/awid/perf.md#connected-production-build)
- [ ] **Lane B** Customer tap feedback within 100 ms, with optimistic feedback where safe.
- [ ] **Lane B** Measure 60 fps scrolling and animation and CLS below 0.05. Defer offscreen images and 3D. Record connected results in [performance evidence](evidence/awid/perf.md).
- [ ] **Lane A** Route bundle budgets enforced in CI at the SPEC target. [Provisional ceilings](evidence/awid/perf.md#connected-production-build)
- [ ] **Lane A** Quote and placement honour code and automatic offers and apply the published stacking rules.
- [ ] **Lane A** Per-customer and global offer limits and idempotent redemption hold under retries and concurrency.
- [ ] **Lane A** Discovery offers filter and badge data match redeemable offers.

## Security

- [ ] **Lane A** Review SPEC §17 and AGENTS §10. Cover every route in the authz matrix and verify customer and merchant isolation.
- [ ] **Lane A** Verify OTP enumeration resistance, attempt caps and SMS/email delivery limits by identifier and IP.
- [ ] **Lane A** Verify upload type, size, decompression limits and metadata stripping.
- [ ] **Lane A** Verify input handling, CSRF, CSP and security headers, session fixation protections and revocation.
- [ ] **Lane A** Review route rate limits, secret handling and dependencies. Resolve high and critical findings.
- [ ] **Lane A** Record findings and their regression evidence in `docs/SECURITY_REVIEW.md`.

## Local production reliability

- [ ] **Lane A** Complete delivery and pickup against local production Compose with customer, restaurant and courier as applicable.
- [ ] **Lane A** Restart API, worker and database mid-order. Prove orders and transitions are neither lost nor duplicated.
- [ ] **Lane A** Disconnect and reconnect the restaurant board and courier. Verify event replay and SSE reconnection.
- [x] **Lane A** Verify timers have one observable effect across retries and restarts. [Expiry and release drills passed](evidence/awid/local-operations.md#pending-order-and-timer-restart)
- [ ] **Lane A** Run k6 for placement and courier position intake at 10× expected pilot load. Record load assumptions and results.

## Operations and release verification

- [ ] **Lane A** Verify health checks and structured logs without personal data.
- [ ] **Lane A** Verify error tracking and alerts through test incidents.
- [x] **Lane A** Complete the SPEC §20 runbooks for deploy, rollback, restore, Ramadan peak, API down, DB full, SMS down, tiles down, OSRM down and restaurant complaint surges. [Runbooks](runbooks/service-incidents.md)
- [x] **Lane A** Keep the encrypted restore drill green with fresh evidence. [Local restore results](evidence/awid/local-operations.md)
- [ ] **Lane A** Integrate Lane B regularly. Require full `pnpm verify` and every browser suite green in GitHub CI before merging.
- [ ] **Lane A** After all preceding Lane A criteria pass, rerun security and reliability from scratch and record the result.
