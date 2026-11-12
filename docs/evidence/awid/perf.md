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
