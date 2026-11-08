# Lane B request: billing migration and routes (M7-2)

> **Status 2026-11-08:** billing migration and admin/merchant read + admin write routes delivered by lane A (`67ec76f`); lane B clients now send `X-Expected-Session-Id`. Still open on lane A: subscription activation and payment reactivation, scheduled invoicing, proof upload, PDF route, Chargily webhook.

Updated 2026-11-08. The billing **contract is published** (`packages/contracts/src/billing.ts`,
lane-a 9cbab96, cherry-picked unchanged into lane-b). This request now asks only for what is still
missing. Lane B's admin billing screen (`apps/web/src/admin/billing/`) runs on MSW handlers built
from that contract (`apps/web/test/mocks/admin-billing-handlers.ts`) until these land.

## 1. Migration (billing tables)

Shapes must serialise to the contract's `billingSubscription`, `billingInvoice`
(`issued | paid | void`), `merchantTransferProofOutput` (`pending_confirmation`) and
`adminRecordPaymentOutput`.

- `billing_settings` singleton matching `billingSettings` (defaults = `billingSettingsDefaults`).
- `subscriptions` (one per merchant): status enum from the contract, `trial_ends_at`,
  `period_starts_at`, `period_ends_at`, `next_invoice_at`; index `(status, next_invoice_at)`.
- `invoice_sequences(year, last_value)` for gap-free `YYYY-NNNNNN` numbers, allocated in the
  issuing transaction.
- `invoices`: amounts as in the contract (`subtotal_dzd + tax_dzd = total_dzd` as a CHECK),
  `unique (subscription_id, period_starts_at)` for BIL-03 idempotency, `void_reason`, `voided_at`.
- `invoice_reminders(invoice_id, day)` primary key, so reminders on days 0/5/7/12 send once.
- `billing_transfer_proofs` (`pending_confirmation` + a resolved state) and `billing_payments`
  with `unique provider_event_id` for Chargily (BIL-05).
- Demo/test merchants never get invoices (BIL-06); lane B's planner already skips them.

## 2. Routes (paths lane B's client and mocks use — keep them or tell lane B)

| Method | Path | Contract |
|---|---|---|
| GET | `/v1/admin/billing/subscriptions` | `adminBillingSubscriptionListQuery/Output` |
| GET | `/v1/admin/billing/invoices` | `adminBillingInvoiceListQuery` → `billingInvoiceListOutput` |
| GET | `/v1/admin/billing/transfer-proofs` | `adminBillingTransferProofListQuery/Output` |
| POST | `/v1/admin/billing/invoices/:invoiceId/void` | `adminVoidInvoiceInput/Output` |
| POST | `/v1/admin/billing/invoices/:invoiceId/payments` | `adminRecordPaymentInput/Output` |
| POST | `/v1/admin/billing/merchants/:merchantId/invoices` | `adminIssueInvoiceInput` |
| GET/PUT | `/v1/admin/billing/settings` | `adminBillingSettingsInput/Output` |
| GET | `/v1/merchants/:merchantId/billing` | `merchantBillingSubscriptionOutput` |
| GET | `/v1/merchants/:merchantId/invoices` | `merchantBillingInvoiceListQuery` → `billingInvoiceListOutput` |
| GET | `/v1/merchants/:merchantId/invoices/:invoiceId/pdf` | `application/pdf` |
| POST | `/v1/merchants/:merchantId/invoices/:invoiceId/proof-media` | `billingProofUploadInput/Output` |
| PUT | `…/proof-media/:proofMediaId/content` (raw image body, 202) | `billingProofMediaOutput` |
| GET | `…/proof-media/:proofMediaId` | `billingProofMediaOutput` |
| POST | `/v1/merchants/:merchantId/invoices/:invoiceId/transfer-proofs` | `merchantTransferProofInput/Output` |
| POST | `/v1/webhooks/chargily` | signature verified, idempotent by provider event id |

All POSTs take `Idempotency-Key`; 409 `invalid_status` when the invoice is no longer `issued`.
Lane B can write the daily job wiring on top of `apps/api/src/billing-schedule.ts` once the
repositories exist.
