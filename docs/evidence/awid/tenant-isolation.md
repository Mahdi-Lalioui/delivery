# Tenant isolation evidence map

## What the checks prove

- `pnpm test:authz` passed **267 tests across 42 suites**. The policy test checks that the registered route inventory has explicit policies and exercises actor-role outcomes. This is route-level authentication/role coverage; it does not prove tenant ownership inside every handler or repository.
- `pnpm test:int` passed **348 tests across 51 files** against local Postgres. The integration tests below provide real-session or persisted cross-account/tenant evidence for the listed resources.

## Customer-owned resources

| Resource/routes | Cross-account evidence |
| --- | --- |
| `/v1/me/addresses` | API concealment: [addresses-http.test.ts](../../../apps/api/test/addresses-http.test.ts). Postgres scope and RLS: [addresses.integration.test.ts](../../../packages/db/test/addresses.integration.test.ts), `[CUS-11:security]`. |
| `/v1/me/favourites`, order history/receipts and order ratings | API session scoping: [favourites-http.test.ts](../../../apps/api/test/favourites-http.test.ts), [order-history-http.test.ts](../../../apps/api/test/order-history-http.test.ts), [order-rating-http.test.ts](../../../apps/api/test/order-rating-http.test.ts). Persisted ownership: [admin-orders.integration.test.ts](../../../packages/db/test/admin-orders.integration.test.ts), covering customer orders/receipts, ratings and favourites. |
| Quote and order placement | API derives customer from session: [order-quotes-http.test.ts](../../../apps/api/test/order-quotes-http.test.ts), [orders-http.test.ts](../../../apps/api/test/orders-http.test.ts). Postgres quote/placement ownership and foreign account denial: [order-quotes.integration.test.ts](../../../packages/db/test/order-quotes.integration.test.ts). |
| Privacy export/deletion challenges | API session binding: [privacy-http.test.ts](../../../apps/api/test/privacy-http.test.ts). Postgres account/challenge scoping: [privacy.integration.test.ts](../../../packages/db/test/privacy.integration.test.ts). |
| Private order tracking and realtime | API topic checks: [tracking-http.test.ts](../../../apps/api/test/tracking-http.test.ts), [realtime-http.test.ts](../../../apps/api/test/realtime-http.test.ts). Real sessions and foreign customer denial: [order-session.integration.test.ts](../../../apps/api/test/order-session.integration.test.ts). |
| Push subscriptions | Postgres prevents another account from stealing an active subscription: [push-subscriptions.integration.test.ts](../../../packages/db/test/push-subscriptions.integration.test.ts). |

## Merchant and restaurant-owned resources

| Resource/routes | Cross-tenant evidence |
| --- | --- |
| Restaurant membership and staff | Real API session role and restaurant scope: [merchant-roles.integration.test.ts](../../../apps/api/test/merchant-roles.integration.test.ts), [merchant-staff.integration.test.ts](../../../apps/api/test/merchant-staff.integration.test.ts). Postgres owner-only writes/list/revoke: [merchant-staff.integration.test.ts](../../../packages/db/test/merchant-staff.integration.test.ts). |
| Menu categories, items, option groups and price changes | Postgres tenant/category/group ownership: [menu-category.integration.test.ts](../../../packages/db/test/menu-category.integration.test.ts), [menu-item.integration.test.ts](../../../packages/db/test/menu-item.integration.test.ts), [menu-option-group.integration.test.ts](../../../packages/db/test/menu-option-group.integration.test.ts), [menu-price.integration.test.ts](../../../packages/db/test/menu-price.integration.test.ts). |
| Menu import and preview | Real API denies cross-tenant previews and changed token context: [menu-import.integration.test.ts](../../../apps/api/test/menu-import.integration.test.ts). Repository checks: [menu-import.integration.test.ts](../../../packages/db/test/menu-import.integration.test.ts). |
| Hours, Ramadan and delivery settings | Membership/non-member checks: [merchant-hours.integration.test.ts](../../../packages/db/test/merchant-hours.integration.test.ts), [merchant-delivery.integration.test.ts](../../../packages/db/test/merchant-delivery.integration.test.ts). |
| Photos and upload reservations | Real API account/restaurant denial: [media-reservation.integration.test.ts](../../../apps/api/test/media-reservation.integration.test.ts). Postgres ownership/session checks: [media-reservations.integration.test.ts](../../../packages/db/test/media-reservations.integration.test.ts). |
| Billing, promotions, reviews and analytics | Billing owner/other-tenant denial: [billing.integration.test.ts](../../../packages/db/test/billing.integration.test.ts). Promotions tenant denial: [repository.integration.test.ts](../../../packages/db/test/promotions/repository.integration.test.ts). Merchant analytics and review scope: [admin-orders.integration.test.ts](../../../packages/db/test/admin-orders.integration.test.ts). |
| Restaurant order board and event replay | Real session membership and outsider denial: [order-session.integration.test.ts](../../../apps/api/test/order-session.integration.test.ts). HTTP replay scoping: [merchant-board-http.test.ts](../../../apps/api/test/merchant-board-http.test.ts), [realtime-http.test.ts](../../../apps/api/test/realtime-http.test.ts). |

## Courier and administrator resources

| Actor/resources | Evidence |
| --- | --- |
| Courier invitations, jobs and assigned deliveries | Assigned-delivery-only session checks: [courier-session.integration.test.ts](../../../apps/api/test/courier-session.integration.test.ts). Restaurant-exclusive invitations: [couriers.integration.test.ts](../../../packages/db/test/couriers.integration.test.ts). Route role matrix is also included in `pnpm test:authz`. |
| Admin orders, dashboard, billing, moderation, platform settings and merchant applications | Admin-only role policy is exercised by the route matrix and endpoint suites [admin-orders-http.test.ts](../../../apps/api/test/admin-orders-http.test.ts), [admin-moderation-http.test.ts](../../../apps/api/test/admin-moderation-http.test.ts), [platform-http.test.ts](../../../apps/api/test/platform-http.test.ts), and [billing-read-http.test.ts](../../../apps/api/test/billing-read-http.test.ts). Persisted admin-session checks and dashboard scope: [admin-orders.integration.test.ts](../../../packages/db/test/admin-orders.integration.test.ts); moderation production wiring: [admin-moderation.integration.test.ts](../../../apps/api/test/admin-moderation.integration.test.ts). Admin access is intentionally global after a valid admin session. |

## RLS and limits

Postgres FORCE ROW LEVEL SECURITY currently provides a second wall for:

- Customer favourites: [migration 0061](../../../packages/db/migrations/0061_customer_favourites_rls.sql).
- Menu command receipts, scoped by merchant and actor: [migration 0062](../../../packages/db/migrations/0062_menu_receipts_rls.sql).
- Customer addresses: [migration 0063](../../../packages/db/migrations/0063_customer_addresses_rls.sql).

Orders and most merchant-owned domain tables do **not** currently have RLS; they rely on explicit repository membership/account predicates and the integration coverage linked above. Orders are read and transitioned by customers, restaurant members, couriers and admins, so adding RLS requires a complete role-aware transaction context and regression coverage.

This is a useful route/resource evidence index, not a complete route-by-route proof. Some endpoint tests are mock-backed HTTP tests, and there is no checked-in mapping from every registered route to a real owner-versus-outsider integration case. Keep the route-by-route isolation readiness item open until that map is complete and the remaining endpoints have direct ownership regressions.
