# Lane A progress

- 2026-11-08 · Low · Recorded the parallel build rules. Next, integrate the green milestone branches, publish lane B contracts and finish M2.
- 2026-11-08 · High · Integrated M0, M1 and the green M2 baseline in order. Both lanes start at `9f675ed`. M2 CI passed all six checks, local verification passed 1,250 unit and 156 PostGIS tests, and Playwright passed 59 foundation and 16 auth cases.
- 2026-11-08 · High · M2 gate remains open at 35/37 acceptance IDs (`MER-01`, `MER-14`). See [baseline audit](../evidence/m2/baseline-audit.md). Local mutation score was 94.07%. The dependency audit reports moderate `GHSA-g3hv-75wg-m249` in tooling via `packages/config`.
- 2026-11-08 · Low · Active worktree is `../lane-a` beside the original `delivery` checkout. Import UI work stays in the original checkout on `m2-merchant-onboarding`; preserve its uncommitted changes. Publish Lane B contracts before resuming it.
- 2026-11-08 · Ultra · `@zaafran/contracts/billing` defines owner subscription, invoice and transfer-proof schemas and admin list, issue, void, record-payment and billing settings schemas. Eight focused cases passed, including the private invoice proof upload contract and zero-tax guard. Lane B owns the routes and UI.
- 2026-11-08 · High · `@zaafran/contracts/promotions` defines code/automatic promotions, discount and eligibility inputs, stats, and four quote rejection codes. All 32 focused cases passed, including rejection of text that cannot round-trip to PostgreSQL. Lane A owns quote integration and redemption.
- 2026-11-08 · Ultra · `@zaafran/contracts/ratings` defines customer rating input and merchant review list, reply and report schemas. All seven focused cases passed. Order ownership, delivery eligibility, edit deadlines and audit are server responsibilities.
- 2026-11-08 · Ultra · `@zaafran/contracts/scheduling` defines address-bound delivery and address-free pickup discovery. All 16 focused cases passed, including preserving exact Iftar time. Server quote and placement revalidate every selection.
- 2026-11-08 · Low · Handoff: rebase or cherry-pick the shared contract commit onto `lane-b` when needed. Lane A next resumes the import hook and production journey, then closes the media, hours, preview, seed and M2 gate gaps.
- 2026-11-08 · Ultra review · No open P0/P1 after the promotion text and billing private-proof fixes. `pnpm verify` exited 0 with 1,313 unit and 156 PostGIS integration tests. Contract cases are qualified so they do not close feature acceptance IDs.
- 2026-11-08 · Ultra · M2-8 menu import opens on an empty menu, binds preview to the live session, and retries a committed apply with its original key after failed readback. `pnpm verify` passed 1,384 unit and 156 PostGIS tests. Playwright passed 59 foundation and 17 auth cases.
- 2026-11-08 · Ultra review · Closed parser metadata and preview identity findings and moved full `MER-12` trace proof to the production browser journey. See [import evidence](../evidence/m2/menu-import.md). Next M2-6 bounded private preview codec and Linux amd64 HEVC conformance under D-007, then the persisted worker job.
- 2026-11-08 · Ultra · Proved M2-6 private preview codec and pinned amd64 HEVC runtime. `pnpm verify` passed 1,411 unit and 156 PostGIS tests. Eight native cases and real HEVC-to-WebP conformance passed. No open P0/P1 in the codec review.
- 2026-11-08 · Ultra · Resume with a forward media migration and private preparation worker. Keep infrastructure failures retryable and temporary inputs lifecycle-scoped. See [codec evidence](../evidence/m2/photo-prepare.md). The old import copy in `../delivery` is superseded by Lane A.
- 2026-11-08 · Medium · Isolated Lane B Compose and browser ports with `infra/lane-b.env`. Both Docker projects ran concurrently and Lane B's PostGIS, Martin and OSRM smoke passed. `pnpm verify` passed on B with 1,411 unit and 156 PostGIS cases, and both lanes passed 59 foundation and 17 auth browser cases.
- 2026-11-08 · Medium review · No P0/P1 on lane isolation. Fresh M2 trace exits 1 at 35/37 (`MER-01`, `MER-14`). Next the private media preparation migration and worker, followed by crop publication, application/item photo attachment and the remaining M2 gate work.
- 2026-11-08 · Ultra · M2-6 Graphile preparation verifies the quarantined original, stores a private WebP before CAS, and serves it through owner-scoped API access. `pnpm verify` passed 1,422 unit and 161 PostGIS tests. Review closed all P0/P1 with rollout sequencing in D-018.
- 2026-11-08 · Ultra · Next bind crop to the original reservation session and publish all variants from the quarantined original. See [photo preparation evidence](../evidence/m2/photo-prepare.md).
- 2026-11-08 · Ultra · M2-6 crop binds to the original live session, enqueues once, and publishes ten private variants plus ThumbHash before cleanup. `pnpm verify` passed 1,432 unit and 169 PostGIS tests. Real HEVC and SeaweedFS conformance passed. Review closed P0/P1 with rollout and legacy behavior in D-019.
- 2026-11-08 · Ultra · Next wire ready photos into merchant applications and menu items, then add the localized crop UI and browser journey. See [media evidence](../evidence/m2/photo-prepare.md).

- 2026-11-08 · Ultra · M2-6 application and item photo attachment passed `pnpm verify` with 1,449 unit and 174 PostGIS cases, plus 17 auth and 59 foundation browser cases. Review closed both P1s. See [evidence](../evidence/m2/photo-prepare.md).
- 2026-11-08 · High · Resume M2-9 dated exceptions. Reuse the existing revision-bound hours command and preview. Close admin notice delivery, cover/logo controls, moderated preview, seed and gate wiring before closing M2.

- 2026-11-08 · High and ultra · M2-9 dated exceptions passed `pnpm verify` with 1,461 unit and 174 PostGIS tests, plus three production browser cases. A sibling schedule save cannot let a stale draft overwrite another tab’s exception. See [hours evidence](../evidence/m2/hours.md).
- 2026-11-08 · Ultra · Next stabilize the import CRC test, whose UTF-8 string offset can differ from the ZIP byte offset. Then add the MER-01 notice read for Lane B’s admin UI and the moderated customer preview for Lane A.

- 2026-11-08 · Ultra · Fixed the M2-8 ZIP CRC fixture using a deterministic timestamp, byte offset and valid-XML control. All 15 file tests passed. Review confirmed truncation and overlap checks are unchanged.

- 2026-11-08 · Ultra · Published the MER-01 in-app notice response contract in `@zaafran/contracts/admin`. The focused test failed before the schema and all eight admin contract tests passed afterward. D-021 records delivery scope and Lane B UI ownership.

- 2026-11-08 · Ultra · MER-01 notice API passed `pnpm verify` with 1,466 unit and 176 PostGIS tests. Production signup and review proved pending notice, retirement and applicant denial. [Lane B handoff](../requests/lane-a-merchant-notice.md) covers the visible notice.
- 2026-11-08 · High · Next implement the authenticated, read-only merchant menu preview. Filter archived, held and rejected items in the card, cursor and detail queries. Keep publication and anonymous customer pages in M3.

- 2026-11-08 · High · The shared menu preview contracts define a revision-bound category page and on-demand item detail. Two new contract cases failed before implementation. All five focused preview and item cases passed. See D-022.

- 2026-11-08 · High and ultra · M2 settings schema, moderated customer preview and demo seed passed `pnpm verify` with 1,493 unit and 185 PostGIS tests, plus all 18 authenticated production browser journeys.
- 2026-11-08 · High · Inspected Arabic and French preview at phone and desktop sizes. The design critic passed. [Evidence](../evidence/m2/menu-preview.md)
- 2026-11-08 · Medium · Mahdi prioritized closing M2, batching Lane B requests, then M3 by Monday night. Finish cover/logo and the combined onboarding browser gate. Track Lane B’s notice and review-token UI in `docs/requests/`. Existing Lane A screens need the premium design pass by 15 November.

- 2026-11-08 · Ultra, high and medium · Cover/logo and combined onboarding passed with 1,518 unit, 187 PostGIS, 203 authorization and 19 authenticated browser cases. Phone and desktop captures passed the design review. [Evidence](../evidence/m2/profile-photos.md)
- 2026-11-08 · High · The actual M2 gate remains at 36/37 because the visible admin notice belongs to Lane B. Two Lane B UI handoffs are open. Prepare the requested shared backend batch from `origin/lane-b` at `2be68d5` while waiting for integration, then M3.
- 2026-11-08 · High · Shared Lane B batch contracts cover settings, public flags, audit, support, favourites, history, receipt, reorder, recipient, analytics, photo-import drafts, privacy, promo lists and Ramadan timing. Six focused cases passed. Published billing and rating schemas remain the API contract.
