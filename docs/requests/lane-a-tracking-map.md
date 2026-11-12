# Algeria tiles for customer tracking

The browser can load `/tiles/algeria/{z}/{x}/{y}` on the web origin. `apps/web/src/maps/algeria-map-style.ts` exports the MapLibre style with local glyphs, Arabic and French labels, and light and dark token palettes. Use the same-origin worker URL pattern in `map-canvas.tsx`. A hosted web build uses `ZAAFRAN_API_ORIGIN` and expects the backend to publish the matching tile path.

Keep the current SVG as the fallback while loading or when WebGL, tiles, or data saving prevent use of the map. The existing tracking contract already returns destination, courier heading and route. Positions and routes stay client-side over the basemap.

Order realtime uses `GET /v1/realtime?topic=order&orderId=…`. The `order` event carries an order summary and replay cursor. Refresh the tracking resource for the new status and ETA. The `position` event carries `trackingPositionEvent` without a replay cursor. Ignore positions whose `capturedAt` is at or before the last applied sample. Retain polling when disconnected. A denied or stale transition on the cancel route returns 409. Use the current `@zaafran/contracts/push` schemas once the branches integrate.
