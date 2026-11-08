# Lane B request: admin settings/flags, privacy and ops contracts (M7-1, M7-3, M7-4, M7-5)

Requested 2026-11-08 by lane B. Admin OTP+TOTP login (AUTH-05) already exists; these cover the rest.

## Settings and flags (ADM-08, M7-3)
- Migration: `platform_settings(key text pk, value jsonb, updated_by uuid, updated_at)` and
  `feature_flags(key text pk, is_enabled bool, scope jsonb null /* e.g. {cityId} */, updated_by, updated_at)`.
  Seed keys: `ordering:<cityId>`, `menu_photo_import`, `online_payments`,
  `subscription_online_payment`, `ramadan_mode`, `maintenance_banner` (text ar/fr/en).
- Contracts: `GET /v1/admin/settings`, `PUT /v1/admin/settings/:key` (zod per key: timeouts,
  first-order cash cap `Dzd`, trial days, price), `PUT /v1/admin/flags/:key {isEnabled, reason}`,
  public `GET /v1/flags` (only client-safe flags + maintenance banner, ETag).

## Users and privacy (ADM-06, CUS-24, M7-4)
- `POST /v1/admin/users/:id/block|unblock {reason}`, `POST /v1/admin/users/:id/anonymise {reason}`.
- Customer: `GET /v1/me/export` (JSON of profile, addresses, orders, ratings),
  `DELETE /v1/me` (OTP re-confirm; anonymises: phone → hash tombstone, name → null,
  addresses deleted, orders keep totals but drop address/location/notes).
- Migration: `users.blocked_at`, `users.blocked_reason`, `users.anonymised_at`.

## Audit and support (ADM-09, ADM-10)
- `GET /v1/admin/audit?actorId=&entity=&from=&to=&cursor=` (keyset on `(created_at,id)`).
- `support_messages(id, user_id, order_id null, body, status, created_at)`, replies via SMS/push adapter.

## Ops (M7-5, NFR-07)
- `GET /metrics` (Prometheus text, internal only), watchdog alert adapter interface
  (`telegram` | `email` | `fake`) — lane B will add it in `apps/api/src/ops-alerts*.ts` (new files).
