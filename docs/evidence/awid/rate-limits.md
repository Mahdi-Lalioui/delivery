# API rate-limit inventory

**Reviewed:** 19 November 2026 · **Scope:** registered HTTP API routes and resource abuse controls.

## Shared API limiter

`createApi` installs `@fastify/rate-limit` as an `onRequest` hook before route
authorization. The default is **120 requests per 60 seconds per normalized
client IP**. The plugin normalizer maps IPv4-mapped IPv6 to IPv4 and groups
native IPv6 by `/64`; Fastify proxy trust determines the client address. Tests
override the limit to two to prove 429 behavior and that auth handlers do not
double-count a request. They do not prove the production threshold of 120; that
value is configured in `apps/api/src/app.ts`.

The default store is an in-memory LRU with capacity 5,000 keys and fixed
windows that start with a client's first request. It is suitable only for the
current single API process: counters reset at process restart and are not shared
by replicas.

| Route family | Additional durable/resource limit | Key and behavior | Evidence |
| --- | --- | --- | --- |
| All registered API routes | 120/IP/60s shared limiter | Normalized IP; before authorization | [`health.test.ts`](../../../apps/api/test/health.test.ts), [`auth-http.test.ts`](../../../apps/api/test/auth-http.test.ts), policy route inventory [`policy.test.ts`](../../../apps/api/test/policy.test.ts) |
| OTP issuance and verified-identifier challenge initiation | 45s resend cooldown; 3/15m and 10/24h per phone/email; identifier changes also 3/15m and 10/24h per account; 20/hour per IP | Postgres request history, serialized reservations and HMAC digests for identifier/account/IP. Confirmation requests do not consume issuance quota. | [`auth.integration.test.ts`](../../../apps/api/test/auth.integration.test.ts), [`auth.integration.test.ts`](../../../packages/db/test/auth.integration.test.ts) |
| OTP verification | 5 wrong codes per challenge, then locked | Attempts persisted per challenge; shared IP limiter also applies | Same API and DB auth tests above |
| Admin TOTP verification | 5 wrong codes per challenge, then locked | Attempts persisted per admin challenge; shared IP limiter also applies. Connected API/Postgres regression proves the first four errors, fifth lock, and that a valid code cannot redeem the locked challenge. | [`auth.integration.test.ts`](../../../apps/api/test/auth.integration.test.ts) (`[AUTH-05:abuse]`) |
| Account-deletion challenge issuance | 45s cooldown; 3/15m and 10/24h per account; 20/hour per IP | Postgres account history, HMAC IP digest and serialized issuance. Confirmation allows five wrong codes before the challenge expires. | [`privacy.integration.test.ts`](../../../packages/db/test/privacy.integration.test.ts), [`privacy-deletion-session.integration.test.ts`](../../../apps/api/test/privacy-deletion-session.integration.test.ts) |
| Order delivery-code proof | 5 incorrect codes, then locked | Per order; replay-safe command receipts | [`order-quotes.integration.test.ts`](../../../packages/db/test/order-quotes.integration.test.ts) (`verifyDeliveryCode`) |
| Delivery proof photo reservations | 5 reservations per assigned order; incomplete reservations count | Postgres count; same idempotency-key replay resolves before quota rejection. Connected integration coverage concurrently creates five, replays an existing key at quota, proves the sixth new key is rejected and checks exactly five rows remain. | [`order-quotes.integration.test.ts`](../../../packages/db/test/order-quotes.integration.test.ts) (`verifyPhotoFallback`) |
| Realtime streams | 4 concurrent streams per session | In-memory session counter per API process; fifth stream gets 429 | [`realtime-http.test.ts`](../../../apps/api/test/realtime-http.test.ts) |
| Push subscriptions | 10 active endpoints per customer account | Customer row lock in Postgres; expired/revoked entries removed before counting | [`push-subscriptions.integration.test.ts`](../../../packages/db/test/push-subscriptions.integration.test.ts) |
| Courier position intake | One request per active courier every 3s | `couriers.last_position_request_at` updated atomically after assigned-order scope is locked | [`order-quotes.integration.test.ts`](../../../packages/db/test/order-quotes.integration.test.ts) (`verifyCourierPositions`) |
| Courier delivery call attempts | One new call per order per 20s; maximum 20 | Quota is per order; authorization is assigned-courier scoped. Matching idempotency replays return the stored response. Current integration coverage proves cooldown/replay, not the 20-call ceiling. | [`courier-delivery-attempts.ts`](../../../packages/db/src/courier-delivery-attempts.ts), [`order-quotes.integration.test.ts`](../../../packages/db/test/order-quotes.integration.test.ts) (`verifyFailedDelivery`); ceiling regression remains open |

All other routes inherit the shared limiter; the table adds durable or resource
specific controls where present. Authorization and tenant predicates are
independent controls, not substitutes for rate-limit tests. The normalizer's
IP grouping is not identical to the canonical IP digest used by Postgres
issuance budgets.

The source currently enforces the courier-call ceiling, but its exact threshold
boundary is not yet covered by a regression. Add that case before treating the
control as fully verified.

## Deployment limitation

The global limiter and realtime stream counter are process-local. Do not scale
the API horizontally until a shared limiter and shared stream accounting (or a
documented per-replica capacity model) are configured and tested. Durable
Postgres quotas listed above are shared across replicas. The test suite proves
configured behavior for the named cases; it is not a multi-replica abuse or
external-provider cost simulation. Provider spend limits still need verification
when SMS/email credentials are configured.
