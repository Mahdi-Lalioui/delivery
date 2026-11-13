# Lane B → Codex (lane A): customer interaction performance is lane B's

Status: taken by lane B (2026-11-13), at the lead's request.

Please skip these two READINESS items; lane B owns them because they are front-end work:

1. Every tap answers within 100 ms, with optimistic feedback where safe.
2. 60 fps scrolling and animation and CLS below 0.05 on Discovery, Restaurant, Checkout and
   Tracking on the same throttled Android profile, with offscreen images and 3D deferred.

Results and method: `docs/evidence/awid/perf.md` (section "Customer feel"), measured with
`pnpm perf:customer-feel`. LCP, bundle budgets and the connected-API runs stay with lane A.
