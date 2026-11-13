# AWID customer performance

Measured 12 November 2026 on the local optimized French team preview in Chromium. Each route had three fresh browser contexts with HTTP cache disabled, Pixel 7 viewport and DPR, 4× CPU slowdown, 75 ms latency, 4 Mbit/s download and 1.5 Mbit/s upload. LCP and CLS came from PerformanceObserver. Each run scrolled the first catalog photo into view to confirm it decoded, then returned to the top. Transfer includes resources requested during that scroll. These are lab measurements on a Mac with a synthetic catalog, with no live API or physical Android device in the loop.

| Route | Original LCP (ms) | Responsive preview LCP (ms) | CLS before → after | Transfer before → after |
|---|---|---|---|---|
| Discovery | 4,604 / 4,492 / 4,488 | 4,436 / 4,476 / 4,460 | 0 → 0 | 1,688 → 1,963 KiB |
| Restaurant | 2,088 / 2,100 / 2,120 | 1,960 / 1,972 / 1,960 | 0.080 → 0.080 | 913 → 586 KiB |

The preview route previously redirected 640 px and 960 px requests to the full-size WebP. Serving those widths reduced Restaurant transfer by 327 KiB. Discovery still misses the time target and transferred more data during the scripted scroll. Restaurant's shift trace names `restaurant-menu` and `restaurant-menu-search`. The Popular row is inserted above search after dish data arrives.

Next checks are a no-scroll first-screen trace on the connected API, deferred loading for offscreen Discovery rails, stable space for asynchronous Restaurant content, and tap-to-feedback and frame pacing measurements on a physical Android phone. The under-2-second, 100 ms, 60 fps and zero-shift targets remain open for the connected app.

## Connected production build

Same Chromium Android, CPU and network profile as above. Used the production Next build with the real Fastify API, a disposable PostGIS database and on-disk encoded media through the same-origin test proxy. Three anonymous, cold French loads per route. No scroll or tap before measurement. The fixture publishes three restaurants and one cover, so it is a small catalog. Reproduce with `pnpm test:e2e:auth e2e/auth-customer-performance.spec.ts --workers=1 --fail-on-flaky-tests`.

| Route | Before splitting Pickup LCP (ms) | After splitting Pickup LCP (ms) | CLS after | Initial JS gzip after |
|---|---|---|---|---|
| Discovery | 2,008 / 1,616 / 1,580 | 1,740 / 1,912 / 1,516 | 0 in all three | 332,159 bytes |
| Restaurant | 1,320 / 1,320 / 1,320 | 1,412 / 1,372 / 1,404 | 0 in all three | 256,264 bytes |

The default feed no longer eagerly imports the pickup map. The browser regression checks each route’s downloaded JS with transitional ceilings of 350,000 and 280,000 gzip bytes. These ceilings prevent growth and are above the SPEC target of 180 KB. The connected fixture has no Popular row, so its zero CLS does not clear the previously observed shift in the richer catalog. Tap latency, frame pacing, a broader connected catalog, and the final bundle target remain open.

## Customer feel: taps, frames and layout shift (lane B, 13 November 2026)

Lane B owns these two items (see `docs/requests/lane-b-customer-feel-perf.md`). Same Chromium
Android profile as above: Pixel 7 device (viewport, DPR, touch), 4× CPU slowdown, 75 ms latency,
4 Mbit/s down and 1.5 Mbit/s up. Production preview build with the richer synthetic catalog
(8 restaurants, Popular rows, offers). Three runs per route. Reproduce with
`pnpm perf:customer-feel http://127.0.0.1:3110 3` on `next build` + `next start` with
`ZAAFRAN_PREVIEW_DEMO=1`. Raw results: [perf-feel.json](perf-feel.json).

Method: CLS from `layout-shift` entries without recent input, across load, 3 s of settling,
3 s of wheel scrolling and the taps. Frames from `requestAnimationFrame` deltas during the
scroll (dropped = a frame longer than 20.7 ms). Tap latency is the Event Timing `duration`
(input to next paint) of the slowest event in each interaction.

| Route | CLS (3 runs) | Scroll fps (avg) | p95 frame | Dropped frames | Taps, input → paint (ms) |
|---|---|---|---|---|---|
| Discovery | 0 / 0 / 0 | 60 | 17 ms | 0 % | Delivery/Pickup 72·40·40, cuisine chip 48·48·48, heart 32·32·32 |
| Restaurant | 0 / 0 / 0 | 60 | 17 ms | 0 % | Dish + 56·40·48, opening hours 32·32·32 |
| Checkout | 0 / 0 / 0 | 60 | 17 ms | 0 % | Add a promo code 32·32·32 |
| Tracking | 0 / 0 / 0 | 56 | 17 ms | 2 % | Call the restaurant 32·32·32 |

Fixes made for these numbers:

- Restaurant CLS 0.080 → 0: the Popular row (inserted above search after dishes arrive) now
  holds its space with same-size placeholder cards until every category has loaded.
- Tracking frames: p95 33 ms and 6 % dropped → p95 17 ms and 2 % dropped. The map is created
  already tilted (no 45° → 55° tilt animation starting a second tile wave), and the first
  courier position is a jump, not an 850 ms glide over unloaded tiles.
- Every tap paints within 100 ms (worst 72 ms). Feedback is immediate where it is safe:
  the heart toggles before the request, the fulfilment switch and filters update at once,
  "+" opens the dish sheet without waiting for the network, and add-to-cart buzzes on tap.
- Deferred: catalog photos are `loading="lazy"` with explicit sizes; MapLibre and the
  three.js tagine are dynamic imports; the pickup map loads only in Pickup mode (lane A).

Still open: Tracking's remaining 2 % long frames come in the first seconds, while vector
tiles and 3D buildings are parsed and uploaded on the 4× throttled CPU. A clean 60 fps there
needs buildings revealed after the first `idle`, or a lighter building layer, then a check on a
physical Android phone. Lab numbers on a Mac, not a phone.

### Buildings after the first idle (13 November 2026, Claude covering while Codex was out)

The `awid-buildings` extrusion layer now starts with `visibility: none` and
`revealBuildingsWhenIdle` shows it on the map's first `idle`. This means the first tile wave
paints flat, without parsing and uploading extrusions at the same time. Unit tests
`[CUS-18]` in `apps/web/test/algeria-map.test.ts` cover the hidden start, the single reveal and
a map torn down before idle. On a `ZAAFRAN_DESIGN_BUILD=1` preview build, Tracking fr-390
loaded with 0 console errors and every tile returned 200. The buildings appear after idle:
[tracking-buildings-after-idle-fr-390.png](perf/tracking-buildings-after-idle-fr-390.png).

There is no frame-pacing result yet. The run was unattended at 03:20 with the Docker VM busy
and a load average of 8–22 on 14 cores. Every route measured 11–31 fps, including Checkout,
which has no map, so the run can't compare before and after. Raw data:
[perf/perf-feel-unattended-2026-11-13.json](perf/perf-feel-unattended-2026-11-13.json).
Re-run `pnpm perf:customer-feel <url> 3` on an awake, idle machine to confirm Tracking's 56
to 60 fps.
