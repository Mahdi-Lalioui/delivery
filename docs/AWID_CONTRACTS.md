# AWID sprint contracts

Use the shared Zod schemas and the HTTP shapes below for fixtures. The new endpoints are
contract handoffs. Address CRUD, quotes, placement, scoped order reads and the accept, reject, cancel, ready, collect, pick-up and force actions are implemented on lane-a. Address voice-note attachments
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
| `POST /v1/merchants/:merchantId/couriers/invites` | `courierInviteInput` → `courierInviteOutput` (201) | Merchant owner |
| `POST /v1/courier/invites/accept` | `courierInviteAcceptInput` → `courierInviteAcceptOutput` | Signed-in account with the invited phone |
| `GET /v1/courier/jobs` | `courierJobsOutput` | Courier, assigned jobs only |
| `POST /v1/courier/presence` | `courierPresenceInput` → 204 | Courier |
| `POST /v1/courier/positions` | `courierPositionsInput` → `courierPositionsOutput` | Courier assigned to the active delivery |
| `GET /v1/merchants/:merchantId/order-board` | `merchantBoardQuery` → `merchantBoardOutput` | Merchant owner, manager or staff on the requested merchant |
| `GET /v1/realtime?topic=merchantOrders&merchantId=:id` | `merchantRealtimeQuery` → SSE order events | Active merchant session scoped to the requested merchant |
| `GET /v1/feed` | `publicFeedQuery` → `publicFeedOutput` | Public |

- Import schemas from `@zaafran/contracts/{orders,addresses,tracking,courier,feed}`.
- Send `Idempotency-Key` on order placement and every order action. Reuse the key
  and request body when retrying. For a new transition use the latest order version.
- A quote binds the server-computed amount to the cart and customer. Submit the returned
  quote ID and optional cash tender to confirm. Retried placement returns its original response for 24 hours. An expired or changed quote requires a
  fresh review. Omit the address ID for pickup.
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
