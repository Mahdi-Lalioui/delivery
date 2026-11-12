# AWID sprint contracts

Use the shared Zod schemas and the HTTP shapes below for fixtures. The new endpoints are
contract handoffs. Address CRUD, quotes, placement, scoped order reads and the accept, reject, cancel, ready, collect, assign, pick-up, deliver by code or verified photo, fail and force actions are implemented on lane-a. The buyer’s authenticated tracking view and the courier invite, roster, presence, jobs and position APIs are implemented. Address voice-note attachments
return `voice_note_unavailable` until the private audio upload and retention flow lands.

| Endpoint | Request and response schemas | Access |
| --- | --- | --- |
| `POST /v1/quotes` | `orderQuoteInput` → `orderQuoteOutput` (201) | Customer |
| `POST /v1/orders` | `orderPlacementInput` → `orderSummary` (201) | Customer |
| `GET /v1/orders/:orderId` | `orderParams` → `orderSummary` | Customer, merchant or courier scoped to the order, or admin |
| `POST /v1/orders/:orderId/:action` | `orderActionInputs[action]` → `orderSummary` | Actor and order scope per SPEC §3 |
| `GET /v1/orders/:orderId/tracking` | `orderParams` → `customerTrackingOutput` | Customer who placed the order |
| `GET /v1/track/:token` | `trackingTokenParams` → `publicTrackingOutput` | Read-only share token |
| `GET /v1/me/addresses` | `addressListOutput` | Customer |
| `POST /v1/me/addresses` | `addressInput` → `addressOutput` (201) | Customer |
| `PUT /v1/me/addresses/:addressId` | `addressParams`, `addressInput` → `addressOutput` | Address owner |
| `DELETE /v1/me/addresses/:addressId` | `addressParams` → 204 | Address owner |
| `GET /v1/merchants/:merchantId/couriers` | `courierRosterOutput` | Merchant member |
| `POST /v1/merchants/:merchantId/couriers/invites` | `courierInviteInput` → `courierInviteOutput` (201) | Merchant owner |
| `POST /v1/courier/invites/accept` | `courierInviteAcceptInput` → `courierInviteAcceptOutput` | Signed-in account with the invited phone |
| `POST /v1/orders/:orderId/delivery-attempts` | `deliveryAttemptInput` → `deliveryAttemptOutput` | Active courier assigned to the order |
| `GET /v1/courier/jobs` | `courierJobsOutput` | Courier, assigned jobs only |
| `POST /v1/courier/presence` | `courierPresenceInput` → 204 | Courier |
| `POST /v1/courier/positions` | `courierPositionsInput` → `courierPositionsOutput` | Courier assigned to the active delivery |
| `GET /v1/merchants/:merchantId/order-board` | `merchantBoardQuery` → `merchantBoardOutput` | Merchant owner, manager or staff on the requested merchant |
| `GET /v1/realtime?topic=merchantOrders&merchantId=:id` | `orderRealtimeQuery` → SSE order events | Active merchant session scoped to the requested merchant |
| `GET /v1/realtime?topic=order&orderId=:id` | `orderRealtimeQuery` → SSE order events | Active customer or merchant session scoped to the order, or admin |
| `POST /v1/me/push-subscriptions` | `pushSubscriptionInput` → 204 | Active customer web session |
| `DELETE /v1/me/push-subscriptions` | `removePushSubscriptionInput` → 204 | Active customer web session |
| `GET /v1/push/public-key` | `pushPublicKeyOutput` | Public when VAPID is configured |
| `GET /v1/wilayas` | `wilayaListOutput` | Public bilingual directory of all 69 wilayas |
| `GET /v1/communes?wilayaCode=:code` | `communeListQuery` → `communeListOutput` | Public, paginated within the chosen wilaya |
| `GET /v1/feed` | `publicFeedQuery` → `publicFeedOutput` | Public |

- Import schemas from `@zaafran/contracts/{orders,addresses,tracking,courier,feed}`.
- Send `Idempotency-Key` on order placement and every order action. Reuse the key
  and request body when retrying. For a new transition use the latest order version.
- A quote binds the server-computed amount to the cart and customer. Submit the returned
  quote ID and optional cash tender to confirm. Retried placement returns its original response for 24 hours. An expired or changed quote requires a
  fresh review. Omit the address ID for pickup. Pass `locale` as `ar`, `fr` or `en`
  so order messages follow the checkout language. It defaults to French.
- Delivery codes are shown only to the signed-in buyer while the driver is en route.
  A wrong code returns `invalid_delivery_code`. Five wrong attempts return
  `delivery_code_locked`. Repeat the original idempotency key after a transport
  failure. A new code attempt needs a new key.
- For a fallback, reserve `kind: "delivery_proof"` with the order ID through
  `POST /v1/media/uploads`. Complete the private crop flow, then send its ready
  photo ID and a reason with the `deliver` action. The merchant board exposes a
  review flag in `deliveryProofs`.
- A driver records `start_wait` at the drop-off and `call` for each call.
  Use a new idempotency key for each action and reuse it on retry. The server
  allows `fail` after ten minutes and two recorded calls.
- A public tracking response contains only the status, times, ETA and first name.
  Use authenticated tracking for exact coordinates and the delivery or pickup code.
- Feed filters are URL query parameters, with `true` and `false` for flags. Preserve
  the query while paging and reset the cursor when it changes. Use the commune as
  the coarse distance reference. Rating, ETA and fee fields are optional during the
  rollout. Render a zero fee as free delivery and treat null or absent as unknown.
- In the cash-only release, the payment-method filters return an empty page when either
  Baridi Pay or TPE is required.
- Fetch the merchant board without a cursor to load its active tickets. Poll with
  `after=<cursor>` to replay events. If `hasMore` is true, fetch the next batch before
  returning to the regular poll interval. The cursor is scoped to one merchant.
- For merchant SSE, send the last board cursor as `after` on the first connection.
  Reconnects use `Last-Event-ID`. The board polls when streaming is unavailable.
- For a single order, use the order version as the initial cursor. The stream
  carries order IDs, versions, timestamps and status. The active buyer also receives
  `event: position` with `trackingPositionEvent` (without an event ID). Positions
  coalesce to the most recent fix and never advance the order cursor. Use the scoped
  tracking view for the courier card and initial pin. An unnamed courier has a null
  first name.
- Register the browser subscription JSON against the active session and remove it
  when opting out. A signed-out or expired session is ineligible for delivery.
- Use the public key with the browser Push API. The service worker receives
  `orderPushPayload` from `@zaafran/contracts/push`. Use its stable `id` as the
  notification tag to coalesce retries and its locale-specific `url` on click.
