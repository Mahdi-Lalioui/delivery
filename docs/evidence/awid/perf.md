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
physical Android phone. The scroll samples ran before the taps. This capture did not measure the 3D toggle or its animation frames. Measurements used throttled Chromium on a Mac.

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

### Flat first paint, tilt after idle (13 November 2026, lane B)

The 03:20 unattended run had no usable numbers, so lane B measured again in the morning. Machine
load was 12–23 on 14 cores, and Checkout (which has no map) held 60 fps as the control. Each row
is three runs with `pnpm perf:customer-feel` on the throttled Android profile, Tracking only.

| Tracking setup | Scroll 3 s after load | Scroll 6–10 s after load |
|---|---|---|
| Buildings after idle only (2bd7b36), tilted from the start | 46–53 fps, 4–5 % long frames | 60 fps, 0 % |
| Never show buildings (probe) | 57 fps, 2 % | — |
| Flat camera, no tilt (probe) | 60 fps, 0 % | — |
| Tilt 40° from the start (probe) | 50–54 fps, 3 % | — |
| **Shipped:** flat first paint, tilt to 55° after first idle, no label fade | 56–57 fps, 3 % | 60 fps, 0 % |

The cost is the tilted camera: it requests the far tiles toward the horizon, and parsing them on
a 4× throttled CPU drops frames. Buildings are a small part of it. Tracking now paints flat and
tilts once the first tile wave has settled; the pickup and address maps stay flat. Settled
scrolling is a clean 60 fps. Scrolling inside the first ~3 s while the tilt's second tile wave
loads is still 56–57 fps, so the 60 fps line stays open until it is checked on a physical
Android phone, or until the street view is offered only after the diner opens it.

## Integrated production build, 13 November

At `0c7a78b`, the connected three-restaurant Playwright fixture passed both
route checks on the same throttled Pixel 7 profile. Discovery LCP was 1,528 /
1,620 / 1,520 ms and Restaurant was 1,424 / 1,400 / 1,404 ms. CLS was zero in
all six samples. Initial gzip JavaScript was 336,777 bytes for Discovery and
258,444 bytes for Restaurant. Both exceeded the SPEC 180 KB target. Richer
connected catalog measurements are still open.

### 3D street view on tap (13 November 2026, lane B)

Mahdi chose to open the street view only on request. The tracking map now stays flat, and a "Vue 3D" / "عرض ثلاثي الأبعاد" / "3D view" toggle on the map (`aria-pressed`) tilts it to 55° and back. Unit test `[CUS-18]` in `apps/web/test/tracking.test.ts` went red, then green.

`pnpm perf:customer-feel http://127.0.0.1:3110 3` on the throttled Android profile, with a machine load of 20:

| Route | CLS | Scroll fps | Long frames | Slowest tap |
|---|---|---|---|---|
| Discovery | 0 | 60 | 0 % | 56 ms |
| Restaurant | 0 | 60 | 0 % | 56 ms |
| Checkout | 0 | 60 | 0 % | 32 ms |
| Tracking | 0 | 60 / 60 / 59 | 0–1 % | 32 ms (Call focus) |

Raw data: [perf/perf-feel-street-view-on-tap.json](perf/perf-feel-street-view-on-tap.json). Street view off and on: [fr](perf/street-view-off-fr-390.png) → [fr 3D](perf/street-view-on-fr-390.png), [ar](perf/street-view-off-ar-390.png) → [ar 3D](perf/street-view-on-ar-390.png). The scroll samples ran before the taps. This capture did not measure the 3D toggle or its animation frames. Measurements used throttled Chromium on a Mac.

## Lane B: initial JS under 180 KB and connected LCP (18 November 2026)

**What changed:**
- **Location dialog:** now a lazy chunk, loaded on intent (pointer over, focus or touch on the pill). Its eager `AlgeriaMap` import had pulled the whole i18n catalogue (69 KB gzip) into Discovery.
- **Search:** split into a field and a lazy dialog.
- **Schemas:** each API client loads its zod schema beside the request that needs it, instead of at module load. This covers feed, search, location, restaurant, checkout, slots, identifiers and orders. Zod was a 90 KB gzip chunk on every customer route.
- **Media constants:** moved to the zod-free `@zaafran/contracts/media-constants`.
- **Orders page:** now has its own server module, so it no longer ships the rating, promotions, analytics and share pages' client code.

**Initial JS** is the module scripts the server HTML references, gzip. `noModule` polyfills are excluded because modern browsers never fetch them. Production build:

| Route | Before | After |
|---|---|---|
| `/fr` (landing) | – | 135,060 |
| `/fr/discover` | 337,145 | 159,433 |
| `/fr/restaurants/:slug` | 258,975 | 163,692 |
| `/fr/checkout` | 264,097 | 164,344 |
| `/fr/orders` | 278,865 | 160,660 |

CI enforces this in `e2e/customer-bundle-budget.spec.ts` (`[NFR-02]`, part of `pnpm test:e2e`), which fails above 180,000 bytes. Run on the production build: 5 passed.

**Connected LCP:** `pnpm test:e2e:auth e2e/auth-customer-performance.spec.ts`, Pixel 7, 4× CPU, 75 ms, 4/1.5 Mbit/s, cold cache, three samples:

| Route | Before (17 Nov) | After | CLS | All JS downloaded during load |
|---|---|---|---|---|
| Discovery | 1,916 / 1,772 / 1,760 ms | 1,628 / 1,500 / 1,488 ms | 0 | 253,006 B (includes the lazy schemas) |
| Restaurant | timed out | 1,476 / 1,440 / 1,460 ms | 0 | 259,062 B |

That fixture has three restaurants. On the richer preview catalogue, with the same profile and three cold samples:
- Discovery fr: 1,600 / 1,484 / 1,500 ms; it was 4.4 s on 12 November.
- Discovery ar: 1,768 / 1,760 / 1,832 ms.
- Restaurant: 1,920 / 1,916 / 1,912 ms.

CLS was 0 throughout, and the LCP element is an image every time. Restaurant has the least margin, because its cover can only start loading after the restaurant JSON arrives on the client. Server-rendering that first response is the next lever.

These are lab measurements in Chromium on a Mac, not on a physical Android phone.

### Connected local production canary (19 November 2026)

Ran against the healthy local production Compose web/API behind Caddy at
`https://awid.localhost:18544`, with the same Pixel 7 emulation, 4× CPU throttle,
75 ms latency and 4/1.5 Mbit/s network profile. One cold Discovery sample measured
1,872 ms LCP, CLS 0, 59 fps average scroll (17 ms p95 frame, 0.99% long frames),
and 64 ms / 32 ms input-to-paint for the fulfilment switch / cuisine chip.
The LCP was an image and the page showed its restaurant rails. This single sample
is a canary, not the three-run acceptance measurement.

The Restaurant URL returned the app's retryable error state because this stack's
`/v1/feed` returned zero restaurants and the requested slug returned 404. Its
1,096 ms LCP is therefore invalid as a content performance result. The other
measured app routes were empty in this stack, so their frame and tap numbers do
not count toward acceptance. This canary is superseded by the data-backed rerun
below. The measurement harness ignores TLS errors only when its target host is
loopback or `.localhost`.

### Data-backed connected Compose rerun (19 November 2026)

To exercise the production image with a populated catalogue, the local-only
`awid-upload-readiness` database was seeded with the repository's fictional
Algiers restaurants. Their `is_demo` flag and approved status were temporarily
changed only in that loopback test database for the run, then restored; the
public feed was empty again afterward. No provider credentials or real customer
or restaurant data was used.

LCP/CLS came from three cold Pixel 7 emulation runs in Chromium against the
production web/API/Caddy stack, at 4× CPU slowdown, 75 ms latency, 4/1.5 Mbit/s.
Discovery displayed 24 restaurant cards; Restaurant displayed the bilingual
seed menu, popular dishes and hours with no console/request errors.

| Route | LCP (ms), 3 cold runs | CLS | Scroll fps, 3 runs | Measured taps (input → paint, ms) |
|---|---:|---:|---:|---|
| Discovery | 1,896 / 1,840 / 1,840 | 0 / 0 / 0 | 60 / 60 / 60 | Fulfilment 72 / 48 / 48; cuisine 32 / 32 / 32 |
| Restaurant | 1,288 / 1,276 / 1,292 | 0 / 0 / 0 | 60 / 60 / 60 | Dish add 48 / 40 / 40; hours 32 / 32 / 32 |

The run used `PERF_RESTAURANT_SLUG=demo-lune-de-semoule pnpm perf:customer-feel
https://awid.localhost:18544 3`; the runner validates the override and ignores
TLS errors only for loopback/`.localhost`. Discovery's favourite action was
unavailable to a guest session. Checkout and Tracking had no fixture order, so
their 60 fps numbers do not count. Tracking 3D tilt frame pacing remains open.
These are throttled desktop Chromium measurements, not physical Android-device
results.

### Connected Tracking tilt (20 November 2026)

Local production Next build, real API and PostgreSQL fixture order, and the
repository's Algiers Martin tile fixture. Chromium used a 390 × 844 viewport,
4× CPU slowdown and the 75 ms / 4 Mbit down / 1.5 Mbit up network profile.
The probe requires a successful vector tile response and a ready map. It
samples the first 600 ms after clicking the 3D control, including the
click-to-first-frame interval. Active FPS separately excludes that interval.

| Build | Journey results | Click-window fps | Active fps | p95 frame | Longest frame |
|---|---|---|---|---|---|
| Baseline | 3/3 passed | 54 / 54 / 54 | 53 / 53 / 53 | 16.8 ms | 83.3–83.4 ms |
| Trial removing the initial no-op camera animation | 2/3 passed | 54 / 53 | 53 / 52 | 16.8 ms | 83.4–99.9 ms |

Each measured sample had one interval over 20.7 ms. The baseline first frame
arrived in 5.7–7.8 ms. The long interval fell during the active tilt. The third
trial journey hit a loopback connection reset before placing the order and
produced no performance sample. The camera trial was reverted because it
did not improve measured pacing. The 60 fps criterion stays open. These lab
samples use a mobile-size viewport with desktop Chromium on a Mac.

With the Algiers fixture served by Martin on loopback port 5501, reproduce with:

```sh
ZAAFRAN_TILE_ORIGIN=http://127.0.0.1:5501 pnpm --filter @zaafran/web build
AWID_MEASURE_TRACKING_TILT=1 ZAAFRAN_TILE_ORIGIN=http://127.0.0.1:5501 \
  pnpm exec playwright test --config=e2e/auth.config.ts \
  e2e/auth-order-journey.spec.ts --grep 'real cash order · delivery' \
  --workers=1 --repeat-each=3
```

[Raw timing samples](perf/tracking-tilt-connected.json)

A follow-up connected profile passed three more delivery journeys. All three
tilts measured 54 fps. The browser Long Tasks API recorded one task per run
at 78, 76 and 75 ms respectively. No Algeria tile requests completed during
the sampled intervals. This demonstrates main-thread contention but does
not identify the responsible function.

Set `AWID_PROFILE_TRACKING_TILT=1` alongside the existing measurement flag
to include a Chromium CPU sampling summary. One connected profile run
passed the journey and recorded 60 active fps with no long task. That sample
did not reproduce the earlier 75–78 ms stall, so it does not establish a fix
or change the readiness verdict.

Three additional profiled connected journeys passed at 60 active fps.
Three equivalent runs without the CPU profiler reproduced 53 active fps
and one 77–80 ms long task each. A follow-up using long-animation-frame
attribution reproduced an 81 ms task but returned no script attribution.
The ordinary interaction remains below target. The profiling runs cannot
be used to close the criterion.

The optional `AWID_TRACE_TRACKING_TILT=1` diagnostic starts Chromium
tracing before reload and reports only events within the marked click
window. A connected run at 53 active fps showed a 78.5 ms browser task,
a 60.7 ms compositor commit and a 56.2 ms GPU task overlapping that window.
The trace does not establish which renderer operation caused the stall.

Deferring Tracking's 3D building layer until the map settled after the
tilt did not improve performance. All three delivery journeys passed,
and all three still measured 53 active fps with 77–81 ms long tasks.
The product trial was reverted.

A temporary diagnostic suppressed custom scooter rendering during camera
movement. Both connected journeys passed, but the two tilt samples diverged
at 34 and 60 active fps. One still had an 82 ms long task. The trial did
not establish a fix and the product code was restored.

With the checksum-matching national archive on 21 November, all three
connected delivery journeys passed. Tracking measured 53 active fps in
each run, with 81–83 ms tasks. The stall therefore also occurs with the
national tiles, and the performance criterion remains open.

A paint-containment trial on the real map wrapper passed all three connected
delivery journeys using the national tiles. Each sample still measured 53
active fps, with main-thread tasks of 76, 78 and 79 ms. No new tiles loaded
during the measured tilt. The CSS trial was reverted.

Disabling the map route blur preserved the delivery journey in three
connected national-map runs but did not resolve the stall. Each measured 53
active fps, with 77–79 ms long tasks and no tile completions during the
measured tilt. The glow was restored.
