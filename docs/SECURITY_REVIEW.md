# AWID local security review

In progress. Scope is SPEC §17 and AGENTS §10, including public, customer, merchant,
courier and administrator routes. All checks use synthetic data on local infrastructure.

## Findings

| Finding | Fix and regression evidence |
|---|---|
| Structured log redaction missed authorization and cookie headers and the stored order contact and address aliases. | Normalized snake-case and hyphenated field names before removing credentials and contact fields. [Red-first logger regression](../apps/api/test/logger.test.ts) |
| First-order promo checks read order history across restaurants. | Scoped the query to the promotion's merchant and tested a prior order at another merchant. [PostGIS regression](../packages/db/test/order-quotes.integration.test.ts) |

## Local evidence

- `pnpm test:authz` passed 265 tests across 42 suites. The route policy suite checks
  its inventory against registered routes. The HTTP suite also exercises cross-origin
  writes and foreign session identifiers.
- `pnpm test:int apps/api/test/auth.integration.test.ts apps/api/test/media-reservation.integration.test.ts`
  passed 13 tests against PostGIS. It covers real phone and email OTP attempts, shared IP
  quota, resend cooldown, HMAC storage, TOTP and upload reservations.
- `pnpm audit --prod --audit-level high` exited zero. The registry reported two moderate
  advisories and zero high or critical advisories.
- All six structured logger tests passed.

## Upload validation

On 13 November 2026, the focused media and logger run passed 44 tests. The
photo preparation tests reject mismatched types, SVG, AVIF declared as HEIC,
uploads over 8 MiB and compressed images over 24 Mi decoded pixels. Preview and
published variants strip source metadata. PostGIS media reservation tests
verify that another account or restaurant cannot access private uploads.

- [Photo upload checks](../packages/media/test/photo-prepare.test.ts)
- [Published variants](../packages/media/test/photo-crop.test.ts)
- [Private media isolation](../apps/api/test/media-reservation.integration.test.ts)

## Verification remaining

Review the route and role inventory, then verify tenant and customer scoping through
the API and PostGIS. Exercise OTP enumeration, attempt caps and delivery rate limits.
Verify session binding and revocation, CSRF, CSP, headers, rate
limits, secret handling and the dependency audit. Record commands and results here as
they pass, then rerun the full security and reliability pass from scratch.

## Browser and API response headers

The Fastify API and same-origin web API return a deny-all CSP, including
`frame-ancestors 'none'`. Web documents retain their nonce-based script policy
and now send same-origin opener and resource policies plus frame denial.
The web and Caddy send HSTS with subdomains.

The API regression failed on both a health response and a 404 before the
change. All seven focused API tests passed afterwards. The production Playwright
header regression and the existing CSP nonce check passed on mobile Chromium,
mobile WebKit and desktop Chromium. The pinned Caddy image served the expected
HSTS header over HTTPS using the checked-in configuration and a local CA.

## Server-rendered admin pages

The web proxy checks the opaque HttpOnly session against the API's active-admin
policy before serving the admin route tree. It forwards only the session
cookie to the configured backend, bypasses caches, and denies access if the
check fails. Test proxy origins require a signed loopback port from the browser
harness. Guest access for every admin page in Arabic, French and English and
standard-session access failed the new browser checks before the fix. All 11
operator, authenticated admin and production route browser tests passed after it.

## Restaurant pages, invite continuations and dependency audit

Restaurant operator pages check the current account's membership and role for
the requested restaurant before rendering. Browser tests cover own-tenant
roles and a different tenant. Staff and courier invitation continuations use
15-minute Secure, HttpOnly, host-only cookies. Browser tests cover reload and
sign-in continuation and absence of raw tokens in browser storage.

All six npm advisories were cleared. Both full and production audits reported
zero advisories after the lockfile update. Full workspace verification passed
with 2,059 unit and 337 PostGIS integration tests. The focused browser run
passed 30 checks across operator access, invitations and production routes.

Gitleaks 8.30.1 scanned 536 commits from a fresh GitHub mirror across its
advertised references and found no leaks. The local shared Git store has
malformed duplicate refs, so this does not cover unpublished local history.
