# Local operations evidence

On 12 November 2026, at checkout `46e8e0f`, the synthetic production Compose project
passed `infra/deploy/production-smoke.sh` through local Caddy with its trusted CA.
The command checked process health, database and worker readiness, 69 wilayas,
a nonempty vector tile and absence of the test outbox.

The same checkout passed `bash infra/deploy/test-restore-drill.sh` with real Docker,
PostGIS and age. It restored the synthetic dump, verified four referenced media files,
rejected missing and truncated media, unsafe archive members and corrupt ciphertext,
and cleaned scratch data after a simulated Docker cleanup error.

The smoke run used an existing local stack image. Restart drills and full order
journeys against a freshly built production Compose image remain open.

The disposable `awid-deploy-test` project recovered through Caddy after restarting
API, worker and PostgreSQL one at a time. The API and database restarts briefly
returned 502 and 503 respectively before the entire HTTPS smoke command passed again.
This smoke test exercised readiness and reference data. The stack had no in-flight
order fixture for this run.

## Pending order and timer restart

On 13 November 2026, the loopback-only `awid-deploy-test` production Compose project
used the newly built `8d05721-readiness` backend image and applied migrations. A
synthetic pickup order was inserted at version 1 in pending acceptance with an
expiry job queued in the same database transaction. Restarted API, worker and
PostgreSQL, then checked that the same order reached `expired:2`. Enqueued an
independent duplicate timer, waited for that job to leave the queue and verified
exactly one expiry event. The HTTPS smoke passed afterwards. This drill seeded the
order directly in PostGIS. HTTP placement during failure and browser replay are
separate outstanding checks.

On the same image, a second fixture started in `scheduled` with a queued release
job. After restarting the same three services, it reached `pending_acceptance:2`.
A duplicate release job completed and the order retained exactly one release
event. The HTTPS smoke passed. Both expiry and release are covered by seeded
order drills.

## HTTPS pickup and idempotent recovery

On 13 November 2026, the same production Compose project used a synthetic
email-only customer, a restaurant owner and a menu item. Only the actors and
catalog were seeded. The customer quoted and placed an ASAP pickup over HTTPS
with a contact number and 500 DZD cash. The placement returned 201.

After stopping API, worker and PostgreSQL, a retry with the same idempotency key
returned 502. After the services restarted, the same retry returned 201 with a
byte-identical response. PostgreSQL contained one order for the quote and one
version-1 placement event. The owner accepted, marked ready and collected the
pickup through HTTPS. Each command and its replay returned identical 200
responses. The persisted events were exactly
`pending_acceptance:1,accepted:2,ready:3,collected:4`. Production smoke passed
again through Caddy. The services were stopped after placement committed.
Delivery, interruption before a placement response and client SSE replay still
need separate drills.

## HTTPS delivery and idempotent recovery

On 13 November 2026, the local production Compose stack at image
`8d05721-readiness` served a complete synthetic delivery through Caddy. The
customer saved a pin, quoted and placed a 637 DZD order. The restaurant accepted
it, marked it ready and assigned its courier. The courier picked it up and
completed delivery with the code from the customer's tracking endpoint.

API, worker and PostgreSQL were stopped after placement. The retry got 502
during the outage and returned the original 201 response after restart. All five
transition replays returned byte-identical 200 responses. PostgreSQL retained
one order for the quote and exactly six versioned events through `delivered:6`.
The production HTTPS smoke passed again. This drill exercised the HTTP journey.
Browser disconnection and replay remain a separate check.

## Connected browser network recovery

The production Next build, real Fastify API and disposable PostGIS passed the
Chromium delivery journey with browser-context disconnections. A delivery
placed while the restaurant board was offline appeared after reconnect, and
the board reopened an HTTP 200 SSE stream. The assigned courier retained the
job with pickup disabled while offline, recovered it after reconnect by
polling, and completed delivery. The initial SSE assertion timed out before
the board fix. Reproduce with `pnpm test:e2e:auth e2e/auth-order-journey.spec.ts
--grep 'real cash order.*delivery' --fail-on-flaky-tests`.

## k6 endpoint smoke

On 13 November 2026, k6 2.3.0 ran for 20 seconds on the disposable production
Compose network through Caddy. All 25 checks passed with zero dropped
iterations. Repeated placement with one synthetic customer and one
idempotency key returned the original order at 1 request/s, p95 15.95 ms.
A synthetic courier sent a new location every 5.1 seconds, p95 7.87 ms.
Each position was accepted. The first attempt used a stationary point,
which the production filter correctly suppressed after its initial sample.
The 10× pilot load check still requires fresh orders and multiple couriers.
