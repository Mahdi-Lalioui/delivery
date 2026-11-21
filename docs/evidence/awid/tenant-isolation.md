# Tenant isolation evidence map

## What the checks prove

- `pnpm test:authz` passed **267 tests across 42 suites**. The policy test checks that the registered route inventory has explicit policies and exercises actor-role outcomes. This is route-level authentication/role coverage; it does not prove tenant ownership inside every handler or repository.
- `pnpm test:int` passed **348 tests across 51 files** against local Postgres. The integration tests below provide real-session or persisted cross-account/tenant evidence for the listed resources.

## Customer-owned resources

| Resource/routes | Cross-account evidence |
| --- | --- |
| `/v1/me/addresses`, delivery quotes and placement | Real-cookie two-customer API test proves lists are private, foreign address update/delete and quote are concealed, and a foreign quote cannot create an order; both customers can place their own quote and persist only their own address snapshot: [customer-address-session.integration.test.ts](../../../apps/api/test/customer-address-session.integration.test.ts). Mocked HTTP concealment: [addresses-http.test.ts](../../../apps/api/test/addresses-http.test.ts). Postgres scope and RLS: [addresses.integration.test.ts](../../../packages/db/test/addresses.integration.test.ts), `[CUS-11:security]`. |
| `/v1/me/favourites`, order history/receipts, ratings and reorder | Real-cookie customer sessions cover favourite-list isolation and independent writes, foreign rating GET/PUT and reorder concealment, and unchanged rows. Paginated history now seeds three interleaved orders per customer at the same restaurant, checks exact ownership across every `limit=1` page, and reuses B's cursor with A's session while checking A-only results: [customer-favourites-session.integration.test.ts](../../../apps/api/test/customer-favourites-session.integration.test.ts), [customer-order-session.integration.test.ts](../../../apps/api/test/customer-order-session.integration.test.ts). API session scoping: [favourites-http.test.ts](../../../apps/api/test/favourites-http.test.ts), [order-history-http.test.ts](../../../apps/api/test/order-history-http.test.ts), [order-rating-http.test.ts](../../../apps/api/test/order-rating-http.test.ts). Persisted ownership: [admin-orders.integration.test.ts](../../../packages/db/test/admin-orders.integration.test.ts), covering customer orders/receipts, ratings and favourites. |
| `/v1/me/push-subscriptions` | Production-API/Postgres sessions prove account B cannot claim or remove account A's endpoint; A's row remains bound to its account/session. Revoked A cannot remove it either: [customer-push-session.integration.test.ts](../../../apps/api/test/customer-push-session.integration.test.ts). Repository concurrency/cap regression: [push-subscriptions.integration.test.ts](../../../packages/db/test/push-subscriptions.integration.test.ts). |
| Verified sign-in identifiers (`GET /v1/me/identifiers`, challenge and confirm) | Real production-API sessions prove a second session of the same account and another customer cannot redeem the owner's email-link challenge; both profiles and DB identifiers stay unchanged until the issuing session succeeds: [auth.integration.test.ts](../../../apps/api/test/auth.integration.test.ts). The repository test separately covers a foreign account and second session: [auth.integration.test.ts](../../../packages/db/test/auth.integration.test.ts). |
| Device sessions and logout (`GET /v1/me/sessions`, `DELETE /v1/me/sessions/:sessionId`, `POST /v1/auth/logout`) | The connected API/Postgres regression signs in two devices for customer A and one for B. Each sees only its own sessions; B's attempt to revoke A's device returns 404 without revocation; A can revoke its own second device and log out all sessions without revoking B. Active-session counts are checked in Postgres: [auth.integration.test.ts](../../../apps/api/test/auth.integration.test.ts). |
| Quote and order placement | API derives customer from session: [order-quotes-http.test.ts](../../../apps/api/test/order-quotes-http.test.ts), [orders-http.test.ts](../../../apps/api/test/orders-http.test.ts). Postgres quote/placement ownership and foreign account denial: [order-quotes.integration.test.ts](../../../packages/db/test/order-quotes.integration.test.ts). |
| Privacy export/deletion challenges | Real-cookie two-customer export confirms own profile, address, orders, contact phone and ratings are returned and all foreign identifiers/private markers are excluded: [privacy-export-session.integration.test.ts](../../../apps/api/test/privacy-export-session.integration.test.ts). End-to-end deletion test proves foreign challenge/code rejection, anonymization, all-session revocation and one-time successful replay: [privacy-deletion-session.integration.test.ts](../../../apps/api/test/privacy-deletion-session.integration.test.ts). Route session binding: [privacy-http.test.ts](../../../apps/api/test/privacy-http.test.ts). Postgres account/challenge scoping: [privacy.integration.test.ts](../../../packages/db/test/privacy.integration.test.ts). |
| Private order tracking and realtime | API topic checks: [tracking-http.test.ts](../../../apps/api/test/tracking-http.test.ts), [realtime-http.test.ts](../../../apps/api/test/realtime-http.test.ts). Real sessions and foreign customer denial: [order-session.integration.test.ts](../../../apps/api/test/order-session.integration.test.ts). |
| Push subscriptions | Postgres prevents another account from stealing an active subscription: [push-subscriptions.integration.test.ts](../../../packages/db/test/push-subscriptions.integration.test.ts). |

## Merchant and restaurant-owned resources

| Resource/routes | Cross-tenant evidence |
| --- | --- |
| Restaurant membership and staff | Real API session role and restaurant scope: [merchant-roles.integration.test.ts](../../../apps/api/test/merchant-roles.integration.test.ts), [merchant-staff.integration.test.ts](../../../apps/api/test/merchant-staff.integration.test.ts). Postgres owner-only writes/list/revoke: [merchant-staff.integration.test.ts](../../../packages/db/test/merchant-staff.integration.test.ts). |
| Menu categories, items, option groups and price changes | Real-session category list/create/rename/reorder denial across restaurant owners preserves category and receipt rows: [menu-category-session.integration.test.ts](../../../apps/api/test/menu-category-session.integration.test.ts). Bulk price preview/apply reject mixed-tenant items and an owner using another restaurant's URL; undo denies both a foreign batch under the owner's URL and the foreign URL itself, without changing prices, revisions, batches, history or receipts: [menu-price-session.integration.test.ts](../../../apps/api/test/menu-price-session.integration.test.ts). A second restaurant owner cannot read/update another owner's option group or attach it to an item; the regression confirms source details and target item revision remain unchanged: [menu-option-group.integration.test.ts](../../../apps/api/test/menu-option-group.integration.test.ts). Another owner cannot update, duplicate, toggle availability or archive a foreign menu item; both menus' rows and revisions are compared afterward: [menu-item.integration.test.ts](../../../apps/api/test/menu-item.integration.test.ts). Postgres tenant/category/group ownership: [menu-category.integration.test.ts](../../../packages/db/test/menu-category.integration.test.ts), [menu-item.integration.test.ts](../../../packages/db/test/menu-item.integration.test.ts), [menu-option-group.integration.test.ts](../../../packages/db/test/menu-option-group.integration.test.ts), [menu-price.integration.test.ts](../../../packages/db/test/menu-price.integration.test.ts). |
| Menu import and preview | Real-session/Postgres API tests prove owner A cannot list or detail owner B's draft, including by using B's resource IDs under A's valid merchant URL; owner B cannot cross-read A's draft either. 404 bodies omit names and IDs; both owners/managers can read their own drafts, while staff/customers are denied, and source rows remain unchanged: [menu-preview-session.integration.test.ts](../../../apps/api/test/menu-preview-session.integration.test.ts). Menu-import cross-tenant and changed-token context: [menu-import.integration.test.ts](../../../apps/api/test/menu-import.integration.test.ts). Repository checks: [menu-import.integration.test.ts](../../../packages/db/test/menu-import.integration.test.ts), [menu-preview.integration.test.ts](../../../packages/db/test/menu-preview.integration.test.ts). |
| Hours, Ramadan, pause, preview and delivery settings | Production API sessions prove the owner can read each settings route while another owner and a customer receive concealed 404s. Twelve foreign writes across hours, Ramadan, pause and delivery settings return 404 without settings rows or command receipts: [merchant-settings-session.integration.test.ts](../../../apps/api/test/merchant-settings-session.integration.test.ts). Repository ownership: [merchant-hours.integration.test.ts](../../../packages/db/test/merchant-hours.integration.test.ts), [merchant-delivery.integration.test.ts](../../../packages/db/test/merchant-delivery.integration.test.ts). |
| Photos and upload reservations | Real API account/restaurant denial for upload reservation: [media-reservation.integration.test.ts](../../../apps/api/test/media-reservation.integration.test.ts). The lifecycle session test proves a foreign account cannot upload bytes or crop a private reservation without DB, storage or job mutation; owner operations succeed. A store read counter proves the foreign account's variant 404 does not access private bytes: [media-lifecycle-session.integration.test.ts](../../../apps/api/test/media-lifecycle-session.integration.test.ts). Real-session reads and writes for restaurant cover/logo photos deny foreign owners and customers without photo changes or command receipts: [merchant-profile-photos-session.integration.test.ts](../../../apps/api/test/merchant-profile-photos-session.integration.test.ts). Postgres media ownership/session checks: [media-reservations.integration.test.ts](../../../packages/db/test/media-reservations.integration.test.ts), [merchant-profile-photos.integration.test.ts](../../../packages/db/test/merchant-profile-photos.integration.test.ts). |
| Merchant review reply and report commands | Two restaurant owners and a customer use real sessions against both restaurant URLs for B's review; every foreign reply/report is concealed as 404 and leaves reply, report and receipt rows unchanged. B can reply and report its own review, with receipts bound to B: [review-command-session.integration.test.ts](../../../apps/api/test/review-command-session.integration.test.ts). |
| Billing, promotions, reviews and analytics | Billing owner/other-tenant repository scope: [billing.integration.test.ts](../../../packages/db/test/billing.integration.test.ts); production API sessions prove the owner sees a seeded subscription and invoice, while foreign owners and customers receive concealed 404s without either private marker: [billing-session.integration.test.ts](../../../apps/api/test/billing-session.integration.test.ts). Promotion list/create/update are denied across real owner/customer sessions with no receipt or promotion mutation: [merchant-promotions-session.integration.test.ts](../../../apps/api/test/merchant-promotions-session.integration.test.ts); repository concurrency and scope: [repository.integration.test.ts](../../../packages/db/test/promotions/repository.integration.test.ts). Merchant analytics and review route reads have real-session owner success and foreign owner/customer 404 coverage: [merchant-insights-session.integration.test.ts](../../../apps/api/test/merchant-insights-session.integration.test.ts); Postgres aggregate ownership and review scope: [admin-orders.integration.test.ts](../../../packages/db/test/admin-orders.integration.test.ts). |
| Restaurant order board, commands and event replay | Real session membership and outsider denial for board access, plus foreign-tenant `reject`, `ready`, `collect`, `assign` and pending `cancel` commands; denial preserves target rows and produces no event or action receipt: [order-session.integration.test.ts](../../../apps/api/test/order-session.integration.test.ts). HTTP replay scoping: [merchant-board-http.test.ts](../../../apps/api/test/merchant-board-http.test.ts), [realtime-http.test.ts](../../../apps/api/test/realtime-http.test.ts). |

## Courier and administrator resources

| Actor/resources | Evidence |
| --- | --- |
| Courier invitations, merchant rosters, jobs and assigned deliveries | Real-session Postgres tests prove a restaurant owner sees only its courier roster and cannot create an invitation for another restaurant; denied calls leave invitation rows unchanged: [merchant-courier-session.integration.test.ts](../../../apps/api/test/merchant-courier-session.integration.test.ts). Invitation acceptance requires the invited phone/email identity and an active session; a different account gets concealed 404, replay creates one courier, and revoked sessions cannot accept: [courier-invitation-session.integration.test.ts](../../../apps/api/test/courier-invitation-session.integration.test.ts). Assigned-delivery-only session checks: [courier-session.integration.test.ts](../../../apps/api/test/courier-session.integration.test.ts); the connected session test also checks `/deliver` and `/fail` denial for foreign and unassigned couriers, with order/code state and event/receipt rows unchanged. Repository invitation ownership: [couriers.integration.test.ts](../../../packages/db/test/couriers.integration.test.ts). Route role matrix is also included in `pnpm test:authz`. |
| Admin orders, dashboard, billing, moderation, platform settings, audit log and merchant applications | Connected production-API session checks cover order search/timeline, dashboard, platform settings, feature-flag writes, audit-log reads, billing settings, invoice issue/payment/void, moderation queue/review, and merchant application queue/review. Active admins succeed; guests/revoked admins are denied with 401 and standard sessions with 403, without unauthorized data or mutations: [admin-order-session.integration.test.ts](../../../apps/api/test/admin-order-session.integration.test.ts), [admin-dashboard-session.integration.test.ts](../../../apps/api/test/admin-dashboard-session.integration.test.ts), [admin-setting-session.integration.test.ts](../../../apps/api/test/admin-setting-session.integration.test.ts), [admin-flag-session.integration.test.ts](../../../apps/api/test/admin-flag-session.integration.test.ts), [admin-audit-session.integration.test.ts](../../../apps/api/test/admin-audit-session.integration.test.ts), [admin-billing-setting-session.integration.test.ts](../../../apps/api/test/admin-billing-setting-session.integration.test.ts), [admin-invoice-session.integration.test.ts](../../../apps/api/test/admin-invoice-session.integration.test.ts), [admin-billing-session.integration.test.ts](../../../apps/api/test/admin-billing-session.integration.test.ts), [admin-moderation.integration.test.ts](../../../apps/api/test/admin-moderation.integration.test.ts), [merchant.integration.test.ts](../../../apps/api/test/merchant.integration.test.ts). Other admin-only role policy is exercised by the route matrix and endpoint suites [admin-orders-http.test.ts](../../../apps/api/test/admin-orders-http.test.ts), [admin-moderation-http.test.ts](../../../apps/api/test/admin-moderation-http.test.ts), [platform-http.test.ts](../../../apps/api/test/platform-http.test.ts), and [billing-read-http.test.ts](../../../apps/api/test/billing-read-http.test.ts). Repository data tests: [admin-orders.integration.test.ts](../../../packages/db/test/admin-orders.integration.test.ts). Remaining admin route scoping is documented in the API route matrix. Admin access is intentionally global after a valid admin session. |

## RLS and limits

Postgres FORCE ROW LEVEL SECURITY currently provides a second wall for:

- Customer favourites: [migration 0061](../../../packages/db/migrations/0061_customer_favourites_rls.sql).
- Menu command receipts, scoped by merchant and actor: [migration 0062](../../../packages/db/migrations/0062_menu_receipts_rls.sql).
- Customer addresses: [migration 0063](../../../packages/db/migrations/0063_customer_addresses_rls.sql).
- Customer push subscriptions: [migration 0065](../../../packages/db/migrations/0065_push_subscriptions_rls.sql); worker cleanup can only see/delete expired tokens or tokens with revoked/expired sessions.

Orders and most merchant-owned domain tables do **not** currently have RLS; they rely on explicit repository membership/account predicates and the integration coverage linked above. Orders are read and transitioned by customers, restaurant members, couriers and admins, so adding RLS requires a complete role-aware transaction context and regression coverage.

Keep the route-by-route isolation readiness item open until every registered ownership-sensitive endpoint maps to a connected test. Remaining connected cases include metadata and variant reads for ready menu or profile attachments by a co-editor who did not upload them, and closing a live realtime stream after its session or merchant membership is revoked. The realtime HTTP suite covers revocation with a repository double.

### Menu items under an owned restaurant

The connected menu-item test sends a category from restaurant A to the list and create routes under restaurant B with B's owner session. Both return concealed 404s. Both menus retain their items and revisions, and their receipt count stays at the three successful setup writes. [Menu-item integration test](../../../apps/api/test/menu-item.integration.test.ts)

### Order-board replay and courier assignment

The connected order-session test reads the accepted and cancelled events through the order-board replay route as the owner. An owner from another restaurant receives a concealed 404 on the same route and an empty replay on their own board. Assigning a courier from that second restaurant to the first restaurant's order returns `invalid_order_command`, leaves the order, events and receipts unchanged, and allows a subsequent valid assignment. [Order-session integration test](../../../apps/api/test/order-session.integration.test.ts)

### Private media metadata and preview

The connected media test confirms a second active session on the same account can read reservation metadata and the private preview. Another account receives concealed 404s and causes zero storage reads. Crop requests from both the second session and the other account receive 404s and leave the state, receipts and jobs unchanged. The issuing session can crop successfully. [Media lifecycle integration test](../../../apps/api/test/media-lifecycle-session.integration.test.ts)

The focused Postgres run passed five tests across these three files with `pnpm test:int --maxWorkers 1 apps/api/test/media-lifecycle-session.integration.test.ts apps/api/test/menu-item.integration.test.ts apps/api/test/order-session.integration.test.ts`.

### Public menu resources and photo attachments

Two active restaurants have separate published menu categories, items, cover photos and item photos. The connected API tests check that category and item lookups stay within the restaurant slug. Variant requests with mismatched restaurant, item or media IDs, a photo of the wrong kind, or an unattached ready item photo return 404 before any storage read. Valid paths return the bytes for their own attachments. [Media resource integration test](../../../apps/api/test/media-resource-isolation.integration.test.ts)

### Delivery proof order binding and access

An assigned courier with two active orders cannot deliver the second order using a ready photo reserved for the first. The denial preserves the active order and creates no order event, receipt or proof attachment. The same photo is accepted on its own order. Following delivery, the restaurant owner and staff can read its metadata and variant. A foreign restaurant owner, the customer and the courier receive 404s without a storage read. [Media resource integration test](../../../apps/api/test/media-resource-isolation.integration.test.ts)

### Menu import and mixed-restaurant category order

A second restaurant owner receives 404 on a foreign import preview and cannot apply the issuing owner's preview token under either restaurant URL. No rows or receipts are added until the issuing owner applies it to the original restaurant. Category reorder also rejects a mixed list submitted through the caller's own restaurant URL, keeping both revisions and the receipt count stable until the valid reorder. [Menu import integration test](../../../apps/api/test/menu-import.integration.test.ts), [category integration test](../../../apps/api/test/menu-category-session.integration.test.ts)

The focused Postgres run passed seven tests with `pnpm test:int --maxWorkers 1 apps/api/test/media-resource-isolation.integration.test.ts apps/api/test/menu-category-session.integration.test.ts apps/api/test/menu-import.integration.test.ts`.

### Cross-restaurant IDs in authorized commands

- One account owns two restaurants. Item create and edit commands and a profile-cover update under the first restaurant reject ready photos from the second. Both restaurants retain their original attachments and revisions, and no command receipt is created. The owner can replace the item photo with one from the addressed restaurant. [Merchant profile photos integration test](../../../apps/api/test/merchant-profile-photos-session.integration.test.ts)
- The restaurant owner cannot reject an order using a sold-out list that includes a foreign item. The denial preserves both items and the order and creates no event or receipt. A valid rejection marks only the ordered item sold out. [Order session integration test](../../../apps/api/test/customer-order-session.integration.test.ts)
- A restaurant owner editing their own option group cannot submit an existing option ID from another restaurant. The denial preserves both groups, menu revisions and receipts. Editing the group's own option succeeds. [Menu option-group integration test](../../../apps/api/test/menu-option-group.integration.test.ts)

The focused Postgres run passed seven tests with `pnpm test:int --maxWorkers 1 apps/api/test/merchant-profile-photos-session.integration.test.ts apps/api/test/customer-order-session.integration.test.ts apps/api/test/menu-option-group.integration.test.ts`.

### Delivery proof reservation

The [connected courier regression](../../../apps/api/test/courier-session.integration.test.ts)
uses real sessions and Postgres. The reservation endpoint denied a foreign
courier, an unassigned courier in the same restaurant and the order customer,
leaving zero reservation rows. The assigned courier received HTTP 201.
`pnpm test:int apps/api/test/courier-session.integration.test.ts` passed.

### Restaurant staff invitation revocation

The [connected staff regression](../../../apps/api/test/merchant-staff.integration.test.ts)
also pairs a foreign invitation ID with the caller's own restaurant ID. The
endpoint returned 404, the invitation remained in the issuing restaurant's
pending list, and its legitimate owner could revoke it. Both staff integration
tests passed.

### Menu category rename

The [connected category regression](../../../apps/api/test/menu-category-session.integration.test.ts)
passes a foreign category ID under the caller's own restaurant URL. The
endpoint returns 404 without exposing the ID, and the original category and
command receipts remain unchanged. The focused Postgres suite passed.

### Courier presence

The [connected courier regression](../../../apps/api/test/courier-session.integration.test.ts)
denies the customer and rejects an explicit foreign courier ID. Both courier
rows stay offline. A valid request then marks only the authenticated courier
online. The Postgres suite passed.

### Promotion update

The [connected promotions regression](../../../apps/api/test/merchant-promotions-session.integration.test.ts)
uses a valid owner session and restaurant URL with a foreign promotion ID.
The request returns 404 without disclosing the ID. The original promotion
and command receipt count remain unchanged. The Postgres suite passed.
