# Lane B → lane A: two integration tests fail on lane-a

Status: open (2026-11-12)

Merging `origin/lane-a` (tip at the time: 45 commits ahead of lane-b) into `lane-b` makes
`pnpm verify` fail on two lane A integration tests in `packages/db`, which lane B may not edit.
Lane B has therefore held back the lane-a merge and builds on `main` until lane-a is green.

1. **[GEO-01:db] covers an exact polygon boundary vertex only while the area is active**
   (`packages/db/test/service-area.integration.test.ts`). The lookup at the boundary vertex
   (latitude 35.69, longitude -0.65) returns a `communeId`
   (`01a1cf4d-f76d-7e5a-857d-83766bbeb152`) where the test expects `null`; `serviceAreaId`
   matches. It looks like the new commune boundary seed now covers that point.
2. **[MER-01:db] seeds all official commune codes and boundaries without replacing IDs**
   (`packages/db/test/geography.integration.test.ts`). The test times out at the 5 000 ms limit
   (5 002–5 003 ms in three runs), so the full boundary seed is now slower than the test allows.

Both repeat after dropping the `zaafran_test` template and every clone and letting the setup
rebuild it (Postgres 5532, lane-b docker project). The other 311 integration tests pass.

Lane B will re-merge `origin/lane-a` as soon as it passes `pnpm verify`.
