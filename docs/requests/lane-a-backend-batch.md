# Lane A backend batch handoff

## Session binding

Billing and platform admin writes require both `Idempotency-Key` and `X-Expected-Session-Id`. Read
the live session ID from the matching authenticated GET envelope. Keep the same key and body
after an ambiguous network failure. Use a fresh key for a deliberate new action. The API returns
`session_changed` for stale tabs.

Promotion list GET returns `{ promotions, sessionId }`. Both POST and PUT use the same two
headers. Display `promotion_code_taken` next to the code input and preserve the user's draft.
Code collisions ignore case. The merchant may configure up to 100 promotions.

## Routes in this slice

- Billing reads under `/v1/admin/billing` and `/v1/merchants/:merchantId`. Admin issue, void and
  payment write routes use `/v1/admin/billing/merchants/:merchantId/invoices` and
  `/v1/admin/billing/invoices/:invoiceId/{void,payments}`. Billing settings uses PUT on its GET
  path. This slice needs an existing subscription. Activation provisioning, payment reactivation,
  scheduled invoicing, proof upload, PDFs and provider confirmation remain open.
- Platform settings GET and per-key PUT under `/v1/admin/settings`. Flag writes use
  `/v1/admin/flags/:key`. Audit GET under `/v1/admin/audit` currently covers platform settings and
  flags. Public `GET /v1/flags` revalidates a weak ETag against the client-safe projection only.
- `GET /v1/ramadan/today?communeId=` uses the Algiers calendar date and the commune centroid when
  `ramadan_mode` is enabled. Slots need checkout inputs and zone/ETA revalidation.

Ratings, order history, receipt, reorder, order analytics and order-related privacy operations
need persisted orders and transitions. The contracts can drive mocks until the storage and
authorization are implemented. These endpoints must not return successful empty stand-ins.
