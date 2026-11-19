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
| The 17 November production audit reported GHSA-fc5q-39xc-vjpf in build/test-only picomatch 4.0.7; upstream has no patched release. | Mahdi approved a single-GHSA scope exception in D-035. `pnpm audit --prod --audit-level high` passed with all other advisories still blocking; the runtime reachability analysis and recheck trigger are below. [Audit evidence](evidence/awid/dependency-audit-nov17.md) |

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
- `pnpm audit --prod --audit-level high` passed after the D-035 scoped exception
  for `GHSA-fc5q-39xc-vjpf`; all other advisories remain blocking. Full
  `pnpm verify` passed after Lane B was merged on 18 November: 55 tooling,
  2,081 unit, 4 native and 349 PostgreSQL integration tests passed; lint,
  typecheck, production build, OpenAPI, Knip, dependency-cruiser, audit and trace
  also exited zero. Browser E2E remains separate from this verification script.
- All six structured logger tests passed.
- Local scanner pass on 18 November: Semgrep `p/security-audit` scanned 918
  first-party files with zero findings; TruffleHog found no verified secrets;
  Gitleaks scanned 527 advertised commits from the remote mirror with no leaks;
  ClamAV scanned 7,996 files (2.39 GiB) with zero detections. Nuclei scanned
  the local production Caddy endpoint with TLS validation and OAST disabled:
  two informational findings (missing `X-Permitted-Cross-Domain-Policies` and
  `Cross-Origin-Embedder-Policy`); required CSP/HSTS/COOP/CORP/X-Frame-Options
  remain covered by dedicated header tests.
- Trivy 0.76.2 rescanned the rebuilt `awid-web`, `awid-backend`, and
  `awid-clamav` images on 18 November with `--ignore-unfixed --scanners
  vuln,secret`: zero high or critical findings and zero image secrets. The
  patched Node base is pinned to the `node:26.13.1-trixie-slim` manifest digest;
  both Debian images apply `apt-get upgrade` during build. The isolated scanner
  image is pinned to ClamAV 1.5.4 and applies `apk upgrade`.
- The companion unfiltered Trivy reports contain no fixed high/critical
  versions for 11 unique CVEs in Debian 13.7 packages (46 package/CVE matches
  per Node image); ClamAV has no reported vulnerabilities. These remaining
  findings, package groups, runtime reachability limits and recheck date are
  recorded below. They are not suppressed from the audit; no further image
  changes are planned for them until a fixed Debian release appears.

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

The 19 November connected Postgres tests extend tenant evidence for courier
completion, merchant order commands, customer addresses/quotes, ratings/reorder,
admin orders/dashboard/billing/platform/moderation/applications, and privacy
export/deletion. The route/resource map links each regression:
[tenant-isolation.md](evidence/awid/tenant-isolation.md). OTP limits, upload
validation, session fixation, API CSP, web/Caddy headers, CSRF and log redaction
have existing passing evidence in this review. These checks are not a substitute
for closing the remaining gaps below.

The customer-favourites endpoints now also have a production-wired, real-cookie
two-customer regression. Each customer sees only their own restaurant list, and
unfavouriting a public restaurant under one account leaves the other account's
relationship intact. See
[customer-favourites-session.integration.test.ts](../apps/api/test/customer-favourites-session.integration.test.ts).

Merchant promotion list/create/update now also have a real-session, two-tenant
regression: foreign owners and customers receive concealed 404s, and denied
writes produce no promotion row or command receipt. See
[merchant-promotions-session.integration.test.ts](../apps/api/test/merchant-promotions-session.integration.test.ts).

Menu category list/create/rename/reorder also have a real-session cross-tenant
regression; foreign requests return 404 without changing rows or receipts. See
[menu-category-session.integration.test.ts](../apps/api/test/menu-category-session.integration.test.ts).

Merchant billing and invoice read routes now have a production-wired Postgres
session regression: each owner can read its own routes, while foreign owners and
customers receive concealed 404s for another restaurant. See
[billing-session.integration.test.ts](../apps/api/test/billing-session.integration.test.ts).

Merchant analytics and review read routes have the same real-session isolation
coverage: the owning restaurant succeeds, while a foreign owner and customer
receive concealed 404s. See
[merchant-insights-session.integration.test.ts](../apps/api/test/merchant-insights-session.integration.test.ts).

Hours, Ramadan schedule, pause, hours preview and delivery settings reads now
have production-wired owner-versus-outsider Postgres coverage; foreign owners
and customers receive concealed 404s across all five routes. The matching
settings writes deny foreign owner/customer sessions across all four write
routes without creating data or command receipts. See
[merchant-settings-session.integration.test.ts](../apps/api/test/merchant-settings-session.integration.test.ts).

Open security review items:

- Complete the exhaustive registered-route-to-resource ownership map. Connected
  tests now cover high-risk routes, but not every customer, merchant, courier and
  administrator endpoint. See the explicit omissions in
  [tenant-isolation.md](evidence/awid/tenant-isolation.md).
- Trace every input schema and query through SQL, process and HTML boundaries;
  adversarial input coverage is not yet complete. No new injectable defect was
  confirmed in the latest source review.
- Finish the route-by-route abuse-limit inventory. The API applies a default
  per-IP limiter before actor resolution, OTP has durable per-identifier/IP/
  account caps, and courier/order domains have additional limits. The intended
  effective limit and key for every sensitive route still needs evidence.
- Finish API header coverage on success, 404 and 5xx paths and prove the full
  required header set at every externally reachable entry point. The production
  smoke now asserts the shared header set on API health and private 404 responses
  as well as web documents; `bash -n infra/deploy/production-smoke.sh` passes.
  The API's deny-all CSP is now tested on success, 404 and an unhandled 500 in
  [health.test.ts](../apps/api/test/health.test.ts). The smoke has not yet run on
  Compose because no deployment env file is present and no local Compose services
  are running; external Caddy 5xx headers remain unverified.
- Re-scan all locally reachable Git history after the local ref repair. The
  previously recorded Gitleaks mirror covered advertised remote history only.
- Run the remaining local and connected security tools against the current
  commit, then rerun the full security and reliability pass from scratch after
  all readiness criteria pass. Deployment and staging DAST are intentionally
  paused per Mahdi's no-deployment direction.

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
integration tests. The current dependency audit passes with only the single
scoped build/test-only exception recorded below; the full security review
remains in progress.
The focused browser run passed 30 checks across operator access, invitations
and production routes.

Gitleaks 8.30.1 scanned all locally reachable references after their repair:
`gitleaks git --log-opts="--all" --redact --no-banner --verbose` scanned 572
commits (11.96 MB) at `16688e5` and found no leaks.

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

The photo preparation worker streams the checksum-verified original to a
private ClamAV daemon using INSTREAM before decoding or writing a preview. A
malware verdict rejects and removes the upload; a scanner failure keeps it
private for automatic retry. The daemon has a separate `clamav/clamav:1.5.4`
image and internal-only network; the Node runtime no longer contains ClamAV or
its scanner tools. Five worker tests cover clean, malware, protocol error,
timeout/unavailable daemon and exclusion of worker environment secrets. All
five passed; production Compose configuration validation passed.

The former integrated ClamAV 1.4.3 image and its CVE findings are superseded by
the current pinned 1.5.4 image. The built production worker reached the
production Compose daemon over its private scanner network: clean bytes were
accepted and the inert EICAR marker was flagged, in addition to the five unit
tests and worker typecheck. The older full-stack upload evidence below covers
the upload pipeline before this scanner transport change.

## Unfixed image findings (recheck 2026-12-18)

Trivy 0.76.2 reports these 11 unique HIGH CVEs with no `FixedVersion` in the
current Debian 13.7 web and backend images. Each listed package is present in
both images. The affected utilities and libraries are not called by the
Node.js app paths. Containers run as non-root and drop all Linux capabilities;
there is no privileged mount or cgroup operation exposed to requests.

| Package(s) | CVE | Why not reachable/exploitable in these images |
| --- | --- | --- |
| `bsdutils`, `libblkid1`, `liblastlog2-2`, `libmount1`, `libsmartcols1`, `libuuid1`, `login`, `mount`, `util-linux` | CVE-2026-76642 | External mount-helper post-hooks require invoking privileged mount behavior. The app never invokes mount helpers and containers lack `CAP_SYS_ADMIN`. |
| same util-linux package set | CVE-2026-78408 | `nsenter --join-cgroup` is not used; app processes do not enter or move between cgroups and have no capabilities. |
| same util-linux package set | CVE-2026-78409 | `X-mount.subdir` requires the vulnerable mount option path; no app feature configures mounts from user input. |
| same util-linux package set | CVE-2026-78410 | Restricted bind-mount redirection requires mount configuration; containers expose no mount API and lack `CAP_SYS_ADMIN`. |
| `libacl1` | CVE-2026-54369 | No application path calls libacl functions; request and upload code uses Node filesystem APIs without changing ACLs. |
| `libsqlite3-0` | CVE-2026-119373 | The application uses PostgreSQL; production dependencies contain no SQLite driver and no user data is processed by SQLite FTS5. |
| `libsqlite3-0` | CVE-2026-119374 | No SQLite FTS5 database or parser is used by API, worker, or web request paths. |
| `libsqlite3-0` | CVE-2026-119379 | The app does not create or apply SQLite session changesets; persistence is PostgreSQL. |
| `libsystemd0`, `libudev1` | CVE-2026-16742 | The containers do not run systemd/systemd-homed and the app does not call their local home-record interfaces. |
| `libtinfo6`, `ncurses-base`, `ncurses-bin` | CVE-2025-69720 | Noninteractive Node services do not render terminal input or load ncurses/terminfo libraries. |
| `perl-base` | CVE-2026-9538 | No Perl or tar process is invoked. Uploads accept validated raster images and the worker uses a dedicated image decoder, not Archive::Tar. |

The recheck date is 2026-12-18, or earlier when Debian publishes a fixed
Trixie package. No fix is claimed for these findings.

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

## Audit exception: GHSA-fc5q-39xc-vjpf (picomatch ReDoS), 18 November 2026

**Decision (Mahdi):** ignore this one advisory in `pnpm audit` instead of waiting for a patch. The exception is the `auditConfig.ignoreGhsas` entry in `pnpm-workspace.yaml`. `pnpm audit --prod --audit-level high` passed on 18 November with the exception; other high/critical advisories still fail the command.

**Why it is safe:**
- `picomatch` ≤ 4.0.7 can be slowed down (ReDoS) by a hostile glob pattern. No patched release exists yet.
- In this repository it is only reached by build and test tooling: vite, vitest, knip, Expo CLI and Metro, the typescript-eslint glob, and `@parcel/watcher` under next-intl's development watcher.
- Those tools compile the repository's own glob patterns. No request, upload or user input in the production web or API runtime reaches `picomatch`.

**Re-check:**
- Run `npm view picomatch version` at the start of each milestone gate, and whenever `pnpm audit` output changes.
- When a release fixes GHSA-fc5q-39xc-vjpf: update the lockfile, delete the `ignoreGhsas` entry and its comment, run `pnpm audit --prod --audit-level high`, and record the result here.
- If a production runtime path to `picomatch` appears, the exception no longer holds. Remove it and treat the advisory as blocking.
