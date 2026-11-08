# M2 category editor evidence

The staged `pnpm verify` passed 51 tooling checks, 664 unit tests and 70 real PostGIS integration tests. `pnpm test:e2e:auth --fail-on-flaky-tests` passed all eight production-build HTTPS Chromium journeys against Docker PostGIS.

The category journey verified a phone by OTP, then opened the French editor as a manager. It created two categories with Arabic and French names, including an overnight availability range, and renamed one. Keyboard and pointer reorder each reached the actual API, restored focus and persisted after reload. A staff-only membership for the same account showed no editing link and received 404 from the category API.

The Arabic and French design matrix covered both themes at 390×844, 768×1024 and 1280×800. All twelve states passed axe WCAG A and AA, language and direction, horizontal overflow, and 44×44 targets. All four 200% text checks at 360×844 also passed. The design critic verified accessible names include the visible action and keyboard reorder announces the confirmed position. [Lossless captures](category-editor/)

The editor heading identifies the feature. The combined menu workspace still needs the active restaurant name so editors can distinguish tabs for different restaurants.
