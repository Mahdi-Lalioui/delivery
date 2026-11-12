# AWID local security review

In progress. Scope is SPEC §17 and AGENTS §10, including public, customer, merchant,
courier and administrator routes. All checks use synthetic data on local infrastructure.

## Findings

| Finding | Fix and regression evidence |
|---|---|
| Structured log redaction missed authorization and cookie headers and the stored order contact and address aliases. | Normalized snake-case and hyphenated field names before removing credentials and contact fields. [Red-first logger regression](../apps/api/test/logger.test.ts) |
| First-order promo checks read order history across restaurants. | Scoped the query to the promotion's merchant and tested a prior order at another merchant. [PostGIS regression](../packages/db/test/order-quotes.integration.test.ts) |

## Verification remaining

Review the route and role inventory, then verify tenant and customer scoping through
the API and PostGIS. Exercise OTP enumeration, attempt caps and delivery rate limits.
Verify upload validation, session binding and revocation, CSRF, CSP, headers, rate
limits, secret handling and the dependency audit. Record commands and results here as
they pass, then rerun the full security and reliability pass from scratch.
