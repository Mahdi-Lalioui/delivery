# AWID local security review

In progress. Scope is SPEC §17 and AGENTS §10, including public, customer, merchant,
courier and administrator routes. All checks use synthetic data on local infrastructure.

## Findings

| Finding | Fix and regression evidence |
|---|---|
| Structured log redaction missed authorization and cookie headers and the stored order contact and address aliases. | Normalized snake-case and hyphenated field names before removing credentials and contact fields. [Red-first logger regression](../apps/api/test/logger.test.ts) |
| First-order promo checks read order history across restaurants. | Scoped the query to the promotion's merchant and tested a prior order at another merchant. [PostGIS regression](../packages/db/test/order-quotes.integration.test.ts) |
| Courier invitations revealed whether a phone or email was an active courier at another restaurant. | Removed the cross-merchant registration lookup. Owners receive the same invitation result; the accepting account still cannot join a second restaurant. [PostGIS regression](../packages/db/test/couriers.integration.test.ts) |
| An unauthorized order action acquired a row lock before checking customer/restaurant access, allowing lock contention on another tenant's order. | Authorize against an unlocked snapshot, then lock and reauthorize before mutation. A real-session regression held the foreign order lock and confirmed the outsider received 404 before release. [Connected Postgres test](../apps/api/test/order-session.integration.test.ts) |
| The media worker launched ClamAV with the worker's full environment, exposing database, delivery and push secrets to the scanner process. | ClamAV now runs with an empty environment. A regression launches a fake scanner with a synthetic secret in the parent and asserts the child cannot read it. [Worker test](../apps/worker/test/media-scanner.test.ts) |
| Production runtime images inherited npm and development tooling, including vulnerable bundled packages, despite needing only Node and production dependencies. | Both runtime Dockerfiles remove npm/npx and assert they are absent while Node remains. The backend build removes workspace `node_modules` after compilation, installs production dependencies cleanly, and declares shared config lint/test tools as dev-only. Rebuilt images pass checks retaining their app entry points and excluding npm, test/lint tools, `undici` and app `picomatch`. |
| The 17 November production audit now reports a new high ReDoS advisory in picomatch 4.0.7, pulled through Expo/Metro. The upstream advisory lists no patched release. | No safe upstream version is available to update to; the advisory is recorded and unsuppressed. The full verification run passed all prior stages, then failed at `pnpm audit --prod --audit-level high`. [Audit evidence](evidence/awid/dependency-audit-nov17.md) |

## Local evidence

- `pnpm test:authz` passed 267 tests across 42 suites. The route policy suite checks
  its inventory against registered routes. The HTTP suite also exercises cross-origin
  writes and foreign session identifiers.
- On 18 November, `pnpm test:authz` passed again (42 suites, 267 tests), and
  `pnpm test:int` passed 51 files and 348 tests against local PostgreSQL. The
  route inventory and broad tenant regressions are green; the route-by-route
  ownership map is still being checked, so the isolation readiness item remains open.
- `pnpm test:int apps/api/test/auth.integration.test.ts apps/api/test/media-reservation.integration.test.ts`
  passed 13 tests against PostGIS. It covers real phone and email OTP attempts, shared IP
  quota, resend cooldown, HMAC storage, TOTP and upload reservations.
- `pnpm audit --prod --audit-level high` was rerun on 18 November and exited 1
  with one high finding, `GHSA-fc5q-39xc-vjpf` in `picomatch@4.0.7`; upstream
  still lists no patched version. `pnpm verify` remains blocked at audit.
- All six structured logger tests passed.
- Local scanner pass on 18 November: Semgrep `p/security-audit` scanned 918
  first-party files with zero findings; TruffleHog found no verified secrets;
  Gitleaks scanned 527 advertised commits from the remote mirror with no leaks;
  ClamAV scanned 7,996 files (2.39 GiB) with zero detections. Nuclei scanned
  the local production Caddy endpoint with TLS validation and OAST disabled:
  two informational findings (missing `X-Permitted-Cross-Domain-Policies` and
  `Cross-Origin-Embedder-Policy`); required CSP/HSTS/COOP/CORP/X-Frame-Options
  remain covered by dedicated header tests.
- Trivy filesystem scan found zero secrets, one high picomatch advisory across
  two lockfile paths, one medium `:latest` Docker tag and three low missing
  health checks. Fresh reports on final rebuilt images show web at 47 high / 94
  medium / 65 low / 17 unknown and backend at 143 high / 1 critical / 162
  medium / 139 low / 20 unknown; both have zero image secrets and neither
  report includes `undici`, `picomatch`, or the moved config tooling. Backend
  findings include Debian `libxml2` CVE-2026-6653 and ClamAV 1.4.3 advisories.
  No findings were suppressed; these images are not release-ready while
  high/critical findings remain.

## OTP abuse and delivery limits

On `lane-a` after `8b1675c`, `pnpm test:authz` passed 267 route/role checks
across 42 suites. The connected integration run passed 20 tests across the
auth, cross-tenant order/merchant, invitation, upload and menu-preview suites.
The auth integration tests exercise the generic response shape for new and
returning email accounts, normalized email, HMAC-only code storage, one-use
codes, five-attempt lockout, resend cooldown, shared phone/email IP quotas,
and the admin TOTP step. A separate real-Postgres run passed all 27 auth
repository integration tests, including new cases for the 3-per-15-minute and
10-per-day email identifier caps, plus existing phone and shared-IP rolling
caps and concurrency checks. See `apps/api/test/auth.integration.test.ts` and
`packages/db/test/auth.integration.test.ts`.

Signed-in identifier changes now share those same 3-per-15-minute and 10-per-day
caps across an account's sessions, IPs and target identifiers. An advisory
transaction lock serializes the account bucket; durable history stores only an
HMAC account key and is preserved by challenge deletion and account erasure.
The four-request, concurrent, pruning and deletion Postgres regressions passed;
the focused auth and privacy integration files passed 48 tests.

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

An earlier audit reported all six then-known npm advisories cleared, and an
earlier full workspace verification passed 2,059 unit and 337 PostGIS
integration tests. The current 18 November audit has since found the high
picomatch advisory recorded above, so dependency security is not cleared.
The focused browser run passed 30 checks across operator access, invitations
and production routes.

Gitleaks 8.30.1 scanned 536 commits from a fresh GitHub mirror across its
advertised references and found no leaks. The local shared Git store has
malformed duplicate refs, so this does not cover unpublished local history.

## Courier page access

The public courier entry handles legacy fragment invitations and never mounts
the jobs workspace. The dedicated workspace checks the HttpOnly session
against the API's active-courier policy before rendering. The check currently
reuses the jobs endpoint, with the response confined to the server. The guest
and role regressions failed before the guard. The connected run passed all
21 operator, courier and order-journey checks, including invitation reload.

## Customer favourites row isolation

Migration 0061 forces row-level security on customer favourites, including
for the non-superuser table owner. Listing, changing and erasing favourites
set the authenticated customer context within their transaction. The real
Postgres regression first exposed both customers' rows using a restricted
role without context. It now verifies no rows without context, only the
customer's own rows with context, and no deletion of another customer's rows.
Full workspace verification passed.

## Merchant menu receipt row isolation

Migration 0062 forces row-level security on menu command receipts. The
repository sets transaction-local restaurant and actor scope after the
existing membership and menu-edit check succeeds. A restricted Postgres role
could originally read all three fixture receipts. The same unfiltered query
now returns zero without scope and exactly one with scope, excluding both
the other restaurant and another staff member at the same restaurant.

## Customer address row isolation

Migration 0063 enables and forces RLS on customer addresses. Address reads and
writes set the authenticated customer ID inside the same transaction; checkout
sets that scope before resolving a delivery pin, and privacy export and
erasure use the same transaction-local scope. A restricted Postgres role could
read seven fixture addresses without a customer context before the migration.
The regression now sees no rows without context, only the current customer's
rows with context, and cannot delete another customer's address. Address,
checkout quote and privacy integration suites passed 48 tests.

## Order action isolation before locking

Order commands now first read an unlocked candidate snapshot and verify the
actor. Only an authorized actor may request the row lock; after acquiring it,
the command rechecks membership/assignment and authorization against the
locked state before replay or mutation. The connected test held the order row
with another transaction: before the change the outsider request remained
blocked, and after the change it returned 404 while the lock remained held.
The legitimate restaurant owner still accepted and cancelled the same order.

The route inventory and authorization matrix passed all 267 checks across 42
suites. The connected order-session regression also confirmed that an owner
of a separate restaurant receives 404 for the other tenant's board and
acceptance command, and that another account receives 404 for the customer's
tracking and receipt. The legitimate customer and merchant retain access.

## Authenticated courier isolation

The connected Postgres API regression creates separate valid standard sessions
for a courier assigned to the order, a courier at another restaurant, and an
active courier at the same restaurant with no assignment. Each jobs response
contains only that courier's assigned deliveries. Foreign and unassigned
position, delivery-attempt and pickup requests return 404; denied position and
attempt writes leave no rows and denied pickup leaves the order at its original
status and version. The assigned courier can post a position, start a delivery
wait and pick up their order. `courier-session.integration.test.ts` passed.

## Realtime and administrator session isolation

Connected sessions can replay only their own merchant and customer order
topics: the order-session integration test returns 404 without order data for
a foreign restaurant owner and a different customer. The admin moderation
integration test accepts a valid admin session and rejects a standard session.
The route authorization suite passed all 267 checks across 42 suites, and the
operator browser suite passed all seven tests, including guest redirects for
every admin page in Arabic, French and English and denial of a standard session
before the admin dashboard renders.

## Session fixation and browser request protections

The real-Postgres auth integration now submits a known attacker-chosen
pre-authentication `__Host-session` token during OTP verification and confirms
the authenticated cookie is newly generated while the known token remains
unauthenticated. The auth integration suite passed 11 tests. The focused API
health/header, auth-route and transport suites passed 52 tests, covering
same-origin cookie writes, cross-origin denial, secure cookie attributes,
session revocation and API CSP. Production browser CSP nonce and COOP/CORP/XFO
checks across Chromium and WebKit are recorded in the browser/header section.
The broader readiness item remains open until the full input/injection review is
complete.

## Caddy upstream error privacy

The local production stack initially returned a 502 without the shared security
headers when the web upstream was unavailable. Caddy's runtime error record also
included the original request URI, IP address, user agent and headers. A local
failure regression now checks a synthetic marker in the query and headers. The
5xx handler returns the original status with CSP, HSTS, frame denial, COOP/CORP
and Permissions-Policy. The default structured logger removes request URI,
headers, host and IP fields. The marker was absent after the fix, and the web
container returned healthy after the test. `caddy validate` and
`infra/deploy/test-caddy-failure.sh` passed. API and PostgreSQL log privacy
checks are recorded below.

## API and PostgreSQL log privacy

API validation uses a synthetic invalid email and header marker and returns
400 without writing either marker to API or Caddy logs. PostgreSQL 18 previously
logged a synthetic duplicate-key value in error detail. Production Compose now
uses terse error logging and explicitly disables bind-parameter logging on
errors. The regression issues a duplicate value through the production API
image's parameterized `postgres` driver and verifies neither marker reaches the
database log. The API/Caddy and Postgres scripts passed, and both containers
were healthy afterward.

## Worker log privacy

The worker logger removes personal fields by normalized key at any object depth
after Pino serialization, including free-form `address` values. The regression
in `apps/worker/test/logger.test.ts` checks nested phone, email, address-object
and address-string values while confirming safe metadata remains. It passed
with `pnpm exec vitest run --coverage.enabled=false
apps/worker/test/logger.test.ts`; worker typecheck and ESLint also passed.

## Quarantined upload malware scanner

The photo preparation worker can invoke ClamAV through an absolute
`CLAMSCAN_PATH`. It scans the checksum-verified original before decoding
or writing a preview. A flagged original is rejected and removed from
quarantine. A scanner failure keeps the original private for automatic
job retry. Both worker regressions failed before the change and then passed.
The production image, signature updates and live scanner verification remain open.

The production backend image now includes ClamAV and CA certificates. The
Compose updater downloaded and validated the signed daily, main and bytecode
databases, then passed its health check. The complete backend image accepted a
clean file, rejected the inert EICAR test marker and reported a missing
database as an error with networking disabled. Compose configuration
validation passed. The distro engine is 1.4.3 and FreshClam recommended
1.4.6.

The production Compose upload journey passed against the running local stack:
a clean PNG was scanned, cropped, published in ten AVIF/WebP variants and
served over HTTPS. The inert EICAR marker was rejected as `invalid_image`,
purged from quarantine, and produced no preview or variant. An initial 415 in
the drill was traced to its request using the wrong binary content type; the
temporary drill was corrected to `application/octet-stream` and rerun. The
reservation keeps the declared `image/png` type. [Full evidence](evidence/awid/local-upload-scanner.md).

The API, worker and signature updater ran as UID 1000 with read-only root
filesystems, all capabilities dropped and `no-new-privileges`; the worker's
ClamAV signature mount was read-only. The updater had only its signature
egress network. Database, Caddy and Martin still use upstream runtime defaults
and need a separate compatibility review before tightening their users or
filesystem permissions. Repository inventory found no inbound webhook routes
or signature verification surface; Twilio/Resend and the SMS webhook are
outbound-only.
