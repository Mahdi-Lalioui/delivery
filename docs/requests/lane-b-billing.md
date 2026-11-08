# Lane B request: subscription billing contracts and migration (M7-2)

Requested 2026-11-08 by lane B. Blocks: BIL-01…06, ADM-07, MER-22 persistence and HTTP.
Pure rules already exist in `apps/api/src/billing-schedule.ts` (lifecycle, reminders 0/5/7/12,
suspension at day 14, invoice number format, idempotency key `subscriptionId:periodStart`).

## Migration `00NN_billing.sql`

- `billing_settings` (singleton): `price_dzd int not null default 5000 check (> 0)`,
  `trial_days int default 30`, `due_after_days int default 7`, `grace_days int default 7`,
  `tax_rate_bp int default 0`, company legal fields (`legal_name`, `nif`, `rc`, `address`).
- `subscriptions`: `id uuid pk`, `merchant_id uuid unique fk`, `status` enum
  (`trialing|active|past_due|suspended|cancelled`), `trial_started_on date`,
  `next_period_start date`, `updated_at timestamptz`. Index `(status, next_period_start)`.
- `invoice_sequences(year int pk, last_value int)` — allocate with `UPDATE … RETURNING` in the
  issuing transaction (gap-free, sequential per year).
- `invoices`: `id`, `subscription_id fk`, `number text unique` (`2027-000123`),
  `period_start date`, `period_end date`, `amount_dzd int`, `tax_dzd int`, `due_on date`,
  `status` (`open|paid|void`), `void_reason text`, `issued_at`, `paid_at`.
  `unique (subscription_id, period_start)` = BIL-03 idempotency. Partial index on open invoices.
- `invoice_reminders(invoice_id, day smallint, sent_at)` pk `(invoice_id, day)`.
- `subscription_payments`: `id`, `invoice_id fk`, `method` (`cash|ccp|baridimob|chargily`),
  `reference text`, `proof_media_id uuid null`, `status` (`pending|confirmed|rejected`),
  `provider_event_id text unique null` (Chargily idempotency), `recorded_by uuid null`,
  `confirmed_at`. Merchants submit `pending`; admin confirms.
- Demo/test merchants (`merchants.is_demo`) never get rows in `invoices` (BIL-06; also enforced
  by the planner).

## Contracts `packages/contracts/src/billing.ts`

- `GET /v1/merchants/:merchantId/billing` → `{ status, trialEndsOn, nextInvoiceOn, openInvoice, invoices[] (keyset) }`.
- `GET /v1/merchants/:merchantId/invoices/:invoiceId/pdf` → `application/pdf`.
- `POST /v1/merchants/:merchantId/invoices/:invoiceId/payments` (Idempotency-Key) body
  `{ method: "ccp"|"baridimob", reference: string(1..64), proofMediaId: uuid }`.
- Admin: `GET /v1/admin/subscriptions?status=&cursor=`, `POST /v1/admin/invoices/:id/void {reason}`,
  `POST /v1/admin/invoices/:id/payments {method, reference, proofMediaId?}`,
  `POST /v1/admin/payments/:id/confirm|reject {reason?}`, `GET|PUT /v1/admin/billing-settings`.
- `POST /v1/webhooks/chargily` (signature header verified, idempotent by event id) behind
  `subscription_online_payment`.

Lane B will build web screens against these shapes with MSW until they land.
