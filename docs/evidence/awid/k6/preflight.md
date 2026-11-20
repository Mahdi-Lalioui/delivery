# k6 courier-position preflight

**Date:** 20 November 2026  
**Scope:** harness correctness only; no HTTP traffic or load was generated.

The pinned `grafana/k6:2.3.0` image loads `load/pilot.js` with a temporary
synthetic fixture. The courier generator now follows a bounded 150 m route in
30 m steps and spaces each courier's samples five seconds apart. The regression
calls the production `acceptedCourierPositions` validator for twelve samples
with ±100/400 ms arrival jitter; **12/12** are accepted. The old 7 m movement
accepted only 4/12 under the same policy.

Checks run:

- `pnpm test:tooling` — 59/59 passed.
- `pnpm exec eslint load/courier-sample.js load/courier-sample.test.js load/pilot.js --max-warnings 0` — passed.
- `pnpm exec tsc --noEmit` and `pnpm knip` — passed.
- `docker run ... grafana/k6:2.3.0 inspect ...` — both scenarios loaded with no network.

This does **not** prove 10× API capacity. The full run still requires the
fixtures and source-IP distribution listed in [the load guide](../../../../load/README.md).

The harness now validates and shares each fixture pool once during k6
initialization. Offline inspection with k6 2.3.0 passed using synthetic
fixtures and networking disabled. The capacity run remains open.

The harness requires matching local HTTPS origins and disables redirects so
fixture cookies stay on the intended disposable stack. The tooling suite
passed 60 tests, and offline k6 inspection confirmed zero redirects.
