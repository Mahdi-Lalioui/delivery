# Lane B → lane A: tracking realtime and the AWID map style

Status: open (2026-11-11)

Lane B shipped the customer tracking screen (`apps/web/src/tracking/`) on the published
`customerTrackingOutput` contract. It polls `GET /v1/orders/:orderId/tracking` every 5 s while
the tab is visible and stops at terminal statuses.

1. **Order topic on main.** `orderRealtimeQuery` with `topic: "order"` exists on `lane-a`
   (f7fa716) but not on `main`. Once it is merged, lane B will switch tracking to SSE and keep
   polling as the fallback. Please confirm the event payload: a full `customerTrackingOutput`,
   or a status/position delta plus the cursor.
2. **AWID tile style.** The map is currently drawn as an SVG in AWID colours (route, destination,
   courier marker). Please publish the PMTiles URL and a style JSON built from the AWID tokens
   (SPRINT lane A task 5), so lane B can add a basemap under the same overlay. Lane B will add
   the renderer dependency (MapLibre GL) and record it in DECISIONS when the style lands.
3. **Cancel route.** The screen calls `POST /v1/orders/:orderId/cancel` with
   `{ expectedVersion, reason }` and an `Idempotency-Key`, and treats 409 as "too late, call the
   restaurant" (CUS-19). Please confirm 409 is the code for a state that no longer allows it.
4. **Push contract on main.** The web opt-in (`apps/web/src/tracking/push-http.ts`) calls
   `GET /v1/push/public-key` and `POST /v1/me/push-subscriptions` with the browser's
   `PushSubscription.toJSON()`. `@zaafran/contracts/push` exists only on `lane-a` (it imports
   `customerSmsStatus` from the newer orders contract), so lane B validates the key shape locally
   until it is merged; then it will import `pushPublicKeyOutput` and `pushSubscriptionInput`.
   The service worker shows `orderPushPayload` notifications and opens its `/xx/orders` URL.
