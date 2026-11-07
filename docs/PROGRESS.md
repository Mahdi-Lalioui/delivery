# PROGRESS

Newest entry first. One entry per task. Evidence = the commands you ran and their result, not opinions.

## Template

### YYYY-MM-DD HH:MM — <task id> <title>
- **Changed:** <files / areas>
- **Evidence:** `<command>` → <result, e.g. "312 passed, 0 failed, coverage 96.1/91.4">
- **Reviewer:** <"no P0/P1" or the fixes applied>
- **Next:** <next task id>
- **Needs Mahdi:** <none / HUMAN_TODO item>

---

### 2026-11-07 23:33 GMT — M2-9 Ramadan schedule input contract (Claude, covering while Codex was out)

- **Changed** — Added `merchantRamadanInput` to `@zaafran/contracts/merchant-hours`. It takes seven unique weekday entries, each with up to four ranges. Every endpoint is `{ kind: "maghrib", minutes: ±720 }` or `{ kind: "clock", minuteOfDay: 0–1439 }`, the same shape as M1 `resolveRamadanRange`. It also takes a nullable non-empty suhoor window, a calculation method from the names `calculateMaghrib` accepts (without `Other`), and a whole-minute adjustment within ±30. Extracted a shared `sevenWeekdays` schema builder used by both weekly hours and Ramadan. Extended D-010.
- **Evidence** — Added 8 `[MER-16:contract]` cases to `packages/contracts/test/merchant-hours.test.ts` first (accepted: Maghrib − 60 to 02:00 with a 00:00–04:00 suhoor, plus a null suhoor with `UmmAlQura`; rejected: `Other`, +31 and 1.5 minute adjustments, Maghrib − 721, clock minute 1440, six weekdays, an empty suhoor). They failed on the missing export, then all 19 file cases passed. `pnpm verify` exited 0: 935 unit tests, 109 PostGIS integration tests, build, knip, depcruise, trace, and only the existing moderate `minimatch` advisory.
- **Reviewer** — Self-reviewed against AGENTS.md §10. No P0/P1. P2: the method list is copied from adhan's `CalculationMethod` keys. When the persistence task wires it to `calculateMaghrib`, add a `@zaafran/geo` test proving every contract method returns a Maghrib time, so a library upgrade cannot drift silently.
- **Next** — Unchanged from the 23:31 entry. Either finish M2-7's panel hook, placement, e2e and screenshots, or design M2-9 persistence. That needs a decision first: which merchant statuses may edit hours (onboarding needs hours before approval, while `lockEditableMenu` only allows approved, active and paused merchants), and whether hours writes share `menu_revision` and `menu_command_receipts` or get their own revision and receipts. Record it as D-011, then write the integration tests.
- **Needs Mahdi** — None.

### 2026-11-07 23:31 GMT — M2-9 opening-hours input contract (Claude, covering while Codex was out)

- **Changed** — Added `@zaafran/contracts/merchant-hours` with `merchantHoursInput`: seven unique weekday entries and up to 60 unique special dates. Each day has up to four whole-minute ranges. A closing minute at or before the opening minute is an overnight range, and same-day overlaps, including an overnight range overlapping a later one, are rejected. Dates use the ISO calendar check. Recorded D-010 and split M2-9 into four sub-tasks in PLAN.
- **Evidence** — Wrote `packages/contracts/test/merchant-hours.test.ts` first (11 `[MER-15:contract]` cases: split days, an 18:00–02:00 range and a 00:00–24:00 day are accepted; a missing or repeated weekday, an empty range, an off-clock or fractional minute, overlaps, five ranges, a repeated special date and 2026-02-30 are rejected). It failed because the module did not exist, then passed. `pnpm verify` exited 0: 927 unit tests, 109 PostGIS integration tests, build, knip, depcruise, trace, and only the existing moderate `minimatch` advisory.
- **Reviewer** — Self-reviewed against AGENTS.md §10. No P0/P1. The schema matches the M1 `hours.ts` weekday and minute conventions, so the persistence task can feed `isOpenAt` without a translation layer.
- **Next** — Two open threads. (1) M2-7, which is closer to the gate: the bulk price hook, workspace placement, CSS, production-build e2e and screenshots described in the 23:29 entry. The hook must refresh the item snapshot without remounting the workspace. `useMenuItemEditor.retry()` resets to loading and moves focus to the heading, so add a revision-bound refresh like `refreshOptionGroups`. (2) M2-9: persist weekly ranges and special dates (replace them in one owner-scoped idempotent transaction on `merchant_hours`, plus a new special-dates table), then Ramadan offsets.
- **Needs Mahdi** — None.

### 2026-11-07 23:29 GMT — M2-7 bulk price panel component and messages (Claude, covering while Codex was out)

- **Changed** — Added `apps/web/src/menu-price/components/bulk-price-panel.tsx`. It is a presentational `BulkPricePanel` driven by a `BulkPriceControls` object. It provides per-item checkboxes with the current price and an all-items-in-category toggle, raise/lower and %/DA radio groups, the amount input (`dir="ltr"`, decimal or numeric keyboard, `aria-invalid` with a described error), and a 1/5/10/50 DA rounding select. It also shows a captioned old → new preview table, then preview and apply buttons. After apply it shows an applied status with an undo button only while `isUndoOffered` holds and the batch is not terminally rejected. Every failure kind maps to a `role="alert"` message. Added the `menuPrice` namespace to the ar, fr and en catalogs. The panel is not yet placed in the workspace.
- **Evidence** — Wrote `apps/web/test/menu-price-panel.test.tsx` first (4 `[MER-11]` static-render cases in Arabic) and saw it fail because the module did not exist. The tests passed after the implementation. Verify failed twice before going green: once at typecheck on a readonly fixture in the new test, fixed with `satisfies`, and once at knip on an unused exported form type, now module-private. The final `pnpm verify` exited 0: 916 unit tests, 109 PostGIS integration tests, build, knip, depcruise, trace, and only the existing moderate `minimatch` advisory.
- **Reviewer** — Self-reviewed against AGENTS.md §10. No P0/P1. Copy comes only from messages, prices use `formatDzd` inside `bdi`, and the component holds no business logic. P2: the no-selection message reuses the amount error id. Give it its own id when the hook lands.
- **Next** — Add `apps/web/src/menu-price/use-bulk-price-panel.ts`. It holds the form and drives `reduceBulkPrice` with `parseBulkAdjustment` and the three client calls, using a `crypto.randomUUID()` key or the state's `retryKey`. It uses the item snapshot's current revision as `expectedRevision` for apply and undo, re-renders at the undo deadline, and calls the item editor's reload after each saved result. Render `BulkPricePanel` in `menu-item-screen.tsx`'s `ItemWorkspace`, add `menuPrice` to the page's `NextIntlClientProvider` messages, and add logical-property CSS with DESIGN tokens for the `bulk-price-*` classes. Then add the production-build Playwright journey (preview, apply, undo, and an expired undo after advancing `/__test__/clock`) and the light/dark × ar/fr × 390/1280 screenshots, and close M2-7.
- **Needs Mahdi** — None.

### 2026-11-07 23:25 GMT — M2-7 bulk price panel state machine (Claude, covering while Codex was out)

- **Changed** — Added `apps/web/src/menu-price/bulk-price-flow.ts`, a pure reducer through editing → previewed → applying → applied → undoing → undone. Apply sends the previewed selection. A network, 5xx or rate-limit failure keeps the idempotency key for the retry, and a definite failure drops it. A revision or session conflict on apply discards the stale preview. `undo-expired`, `price-changed` and `already-undone` permanently close undo for that batch. Changing the selection discards a preview, and events that do not fit the current step are ignored. Exported the `BulkPricePreview` and `BulkPriceBatch` types from the client.
- **Evidence** — Wrote `apps/web/test/menu-price-flow.test.ts` first (10 `[MER-11]` cases) and saw it fail because the module did not exist. The tests passed after the implementation. The first `pnpm verify` failed at lint because the reducer's complexity was 11. After moving the step guards into the finish helpers, verify failed at knip on an unused exported type. With that type made module-private, `pnpm verify` exited 0: 912 unit tests, 109 PostGIS integration tests, build, knip, depcruise, trace, and only the existing moderate `minimatch` advisory.
- **Reviewer** — Self-reviewed against AGENTS.md §10. No P0/P1. No business logic remains for the component. Retry keys follow the existing uncertain-response rule used by the option-group and item editors.
- **Next** — Add the `BulkPricePanel` component and a `useBulkPricePanel` hook in the menu item workspace (`menu-item-screen.tsx`). The hook drives `reduceBulkPrice` with `previewBulkPrices`, `applyBulkPrices` and `undoBulkPrices`. Use the current snapshot revision as `expectedRevision` for both apply and undo, and reload the item list after each saved result. The component offers per-row and whole-category checkboxes, raise/lower, %/DA, a 1/5/10/50 rounding select defaulting to 10, the old → new preview table, and an undo button gated by `isUndoOffered`. Add `menuPrice` messages in ar/fr/en, logical CSS with DESIGN tokens, a production-build Playwright journey (including an expired undo via `/__test__/clock`), and the screenshot matrix.
- **Needs Mahdi** — None.

### 2026-11-07 23:22 GMT — M2-7 bulk price input parsing and undo deadline (Claude, covering while Codex was out)

- **Changed** — Added `apps/web/src/menu-price/bulk-price-editor.ts`. `parseBulkAdjustment` reads a raise or lower amount, either as a percentage with up to two decimals (a dot or French comma, plus Arabic-Indic and Persian digits) converted exactly to basis points without floating-point maths, or as whole dinars. It rejects zero, signs, exponents, suffixes and anything outside the shared `bulkPriceAdjustment` contract. `isUndoOffered` hides the undo button after ten minutes on the local clock. The server remains the authority (D-009).
- **Evidence** — Wrote `apps/web/test/menu-price-editor.test.ts` first (19 `[MER-11]` cases) and saw it fail because the module did not exist. The tests passed after the implementation. `pnpm verify` exited 0: 902 unit tests, 109 PostGIS integration tests, build, knip, depcruise, trace, and only the existing moderate `minimatch` advisory.
- **Reviewer** — Self-reviewed against AGENTS.md §10. No P0/P1. Percent parsing is integer-only, so 2.5 % becomes exactly 250 basis points.
- **Next** — The bulk price panel component in the menu item workspace. It uses `parseBulkAdjustment`, `previewBulkPrices`, `applyBulkPrices`, `undoBulkPrices` and `isUndoOffered`, with ar/fr/en messages, logical CSS with DESIGN tokens, a production-build Playwright journey (select, preview, apply, undo, and an expired undo via the test clock), and the light/dark × ar/fr × 390/1280 screenshots.
- **Needs Mahdi** — None.

### 2026-11-07 23:20 GMT — M2-7 bulk price web client (Claude, covering while Codex was out)

- **Changed** — Added `apps/web/src/menu-price/bulk-price-http.ts`: `previewBulkPrices`, `applyBulkPrices` and `undoBulkPrices` against the three MER-11 endpoints. Requests are private, no-store and same-origin. Apply and undo send the idempotency key and the expected session. Responses are parsed with the shared contracts. A preview or apply that omits or adds an item, or an undo that echoes a different batch, is refused. Every problem code maps to a UI outcome: `undo-expired`, `price-changed`, `already-undone`, `revision-conflict`, `session-changed`, `invalid-change`, sign-in, forbidden, and rate-limited. Network and 5xx failures keep the retry key.
- **Evidence** — Wrote `apps/web/test/menu-price-http.test.ts` first (15 `[MER-11]` cases) and saw it fail because the module did not exist. It passed after the implementation. `pnpm verify` exited 0: 883 unit tests, 109 PostGIS integration tests, build, OpenAPI check, knip, depcruise, trace, and only the existing moderate `minimatch` advisory.
- **Reviewer** — Self-reviewed against AGENTS.md §10. No P0/P1. The client never sends a price. It only sends the selection, the adjustment and the expected revision.
- **Next** — The bulk price panel in the menu item workspace. Build a pure editor that turns the percent or DA input into an adjustment (`basisPoints`/`amountDzd`, with whole-number validation) and tracks the undo deadline. Then add the component with ar/fr/en messages and RTL-safe logical CSS tokens, a production-build Playwright journey (select, preview, apply, undo, and an expired undo using the test clock), and the light/dark × ar/fr × 390/1280 screenshots.
- **Needs Mahdi** — None.

### 2026-11-07 23:18 GMT — M2-7 ten-minute bulk price undo (Claude, covering while Codex was out)

- **Changed** — Added `POST /v1/merchants/:merchantId/menu/prices/batches/:batchId/undo`: an idempotent, session-bound menu command (`bulk_price_undo`, migration `0011_menu_price_undo.sql`) in the new `packages/db/src/menu-price-undo.ts`. It locks the batch, rejects an already-undone batch, an expired one (the pure `isBulkPriceUndoOpen` in `@zaafran/domain`, ten minutes inclusive on the injected clock) and one where any item is archived or no longer holds the price the batch set. Otherwise it restores every recorded old price atomically, stamps `undone_at` and bumps the menu revision. Added `bulkPriceUndoInput`/`bulkPriceUndoOutput` contracts. Recorded D-009.
- **Evidence** — Wrote the tests first and watched each fail for the right reason: `[MER-11:domain]` window boundary (`isBulkPriceUndoOpen is not a function`), five `[MER-11:db]` cases on real PostGIS (`undo is not a function`): undo at exactly ten minutes with replay, expiry at ten minutes plus 1 ms with prices untouched, price changed since apply, second undo under a new key, foreign-merchant batch and staff denial. Also `[MER-11:contract]`, six `[MER-11:http]` cases, a new `[AUTH-08]` matrix row and the OpenAPI path list. `pnpm verify` exited 0: 868 unit tests, 109 PostGIS integration tests, build, OpenAPI check, knip, depcruise, trace, and only the existing moderate `minimatch` audit advisory. The first verify run failed at knip (an unused exported type and a duplicate schema export); both were fixed before the green rerun.
- **Reviewer** — Self-reviewed against AGENTS.md §10 (no subagents in this takeover run). No P0/P1. Restored prices come only from `price_history` and never from the request. Ownership is SQL-scoped on the batch, history and item queries. The per-merchant revision lock serializes undo against apply and other edits, and the batch row lock blocks a double undo. Batch lookup uses the primary key and history uses the `(batch_id, item_id)` unique index.
- **Next** — M2-7's last sub-task: the merchant-facing bulk price panel in the menu workspace (select items or a category, percent or fixed DA, rounding unit, preview table old → new, apply, then an undo action while the ten-minute window is open). Build it against the three committed endpoints, with ar/fr/en messages, a production-build Playwright journey, and the light/dark × ar/fr × 390/1280 screenshot matrix. Media remainder (M2-6: real HEVC decode in the worker, the cropper UI) is still open.
- **Needs Mahdi** — None.

### 2026-11-07 22:41 GMT — M2-7 bulk price persistence, apply and history (Claude, covering while Codex was out)

- **Changed** — Added `price_change_batches` and `price_history` tables (migration `0010_menu_price_history.sql`) and extended the `menu_command_receipts` operation check with `bulk_price_apply`. Added `@zaafran/contracts/menu-price` (preview/apply input and output schemas), `@zaafran/db/menu-price` (a repository with `preview`, a read-only snapshot of live prices against the menu revision, and `apply`, which locks the same items `FOR NO KEY UPDATE`, recomputes the rounded change from their current stored price inside the write transaction, updates `items.price_dzd`, records `price_history` and a `price_change_batches` row, and bumps the revision through the existing `runMenuCommand` idempotency/revision guard), and `POST /v1/merchants/:merchantId/menu/prices/{preview,apply}` in `apps/api`, wired into `app.ts`/`start.ts`. The server never trusts a client-sent old or new price; see D-008. Added a first `@zaafran/domain` dependency to `@zaafran/db` and enabled `rewriteRelativeImportExtensions` in `apps/api/tsconfig.build.json` so the api build can type-check through it.
- **Evidence** — Wrote `[MER-11:contract]`, `[MER-11:db]` (8 cases against real PostGIS: preview, cross-tenant denial, staff denial, apply with history/batch/revision bump, idempotent replay, stale revision, missing item, int4-overflow rejection) and `[MER-11:http]` tests first and watched them fail for the right reason before implementing. Added both new routes to the `[AUTH-08]` authorization matrix (owner/manager only, same as the other menu editor routes) and to the hardcoded OpenAPI path list in `health.test.ts`; regenerated `docs/openapi.json`. `pnpm verify` passed clean: 860 unit tests, 104 real PostGIS integration tests, build, knip, depcruise, trace, and the pre-existing moderate `minimatch` audit advisory only.
- **Reviewer** — Self-reviewed per AGENTS.md §10 (no subagents available in this takeover run). No P0/P1: money is always recomputed server-side from a row locked in the same transaction (never from client input), ownership stays SQL-scoped (`merchant_id = …`) in every query, the int4 ceiling is checked before the column would overflow, and the apply command is idempotent (proven by the replay test) and race-safe (item lock plus the existing per-merchant revision lock). This is a partial slice of M2-7: the ten-minute undo endpoint and the preview/apply/undo UI remain unchecked in PLAN.md.
- **Next** — M2-7's third sub-task: the ten-minute undo endpoint that reads a `price_change_batches` row, rejects an expired batch (`applied_at` more than 10 minutes ago) or one whose item prices changed since the apply (compare current `items.price_dzd` to the batch's `price_history.new_price_dzd`), and reverts to `old_price_dzd` atomically. Then the merchant-facing preview table and apply/undo UI (fourth sub-task). Media milestone remainder (M2-6: real HEVC decode in the worker, the cropper UI) is still open.
- **Needs Mahdi** — None.

### 2026-11-07 22:00 GMT — M2-7 bulk price rounding calculation (Claude, covering while Codex was out)

- **Changed** — Added `@zaafran/domain`'s `bulk-price-change` module: a pure `previewBulkPriceChange` function that takes a percent or fixed-DA adjustment and a rounding unit (1/5/10/50 DA) and returns each item's old and new DZD price. Uses one exact-fraction rounding step (ties up) instead of compounding float/percent rounding, then clamps a nonpositive result to zero to satisfy the `items.price_dzd >= 0` constraint. Rejects an empty or oversized selection, a duplicate item id, an invalid rounding unit, and an out-of-range or non-integer adjustment. Registered the new subpath export in `packages/domain/package.json`.
- **Evidence** — Wrote `[MER-11:domain]` unit tests first (percent/fixed rounding, exact-half ties up, zero clamping, ordering, each rejection case, and a 1,000-run fast-check property that every result is a nonnegative multiple of the rounding unit) and watched them exercise the new module. `pnpm verify` passed clean: 852 unit tests (up from 831), 96 real PostGIS integration tests, build, knip, depcruise, trace, and the pre-existing moderate `minimatch` audit advisory only (below the high threshold).
- **Reviewer** — Self-reviewed per AGENTS.md §10 (no subagents available in this takeover run). No P0/P1: the function is pure (no IO, no Date.now, no randomness), money stays integer/BigInt throughout so no float rounding error, and an out-of-range result is routed through the existing `dzd()` boundary check rather than silently wrapping. This is a partial slice of M2-7: PLAN.md now carries the remaining sub-tasks (persist/apply/history, the 10-minute undo endpoint, and the UI) as unchecked.
- **Next** — M2-7's second sub-task: persist the per-item preview binding and apply rounded changes plus price history atomically on the existing menu command/revision guard in `packages/db` (reuse `runMenuCommand`'s per-merchant `menu_revision` optimistic-concurrency pattern), then the 10-minute undo endpoint and the preview/apply/undo UI. Media milestone remainder (M2-6: real HEVC decode in the worker, the cropper UI) is still open.
- **Needs Mahdi** — None.

### 2026-11-07 21:20 GMT — M2-5/M2-6 category rail and quarantined photo streaming (Claude, covering while Codex was out)

- **Changed** — Finished three pieces left mid-flight: (1) committed Codex's already-tested private media reservation API (reserve/read, PostGIS schema, authorized routes) unchanged; (2) added the `@zaafran/media` local/S3 `MediaStore` package and the authenticated `PUT /v1/media/uploads/:mediaId/content` route — validates content type, content-encoding and the 8 MiB ceiling before buffering, rejects a declared-length mismatch, computes the SHA-256 digest, quarantines the object, then adopts it with cleanup on a known replay or rejected outcome and no cleanup on an unknown adoption failure; wired a new zod-validated `MEDIA_STORAGE_ROOT` env var (defaults under the OS temp dir) into `start.ts`; (3) committed Codex's already-tested desktop category rail beside the menu item workspace (hidden below 1200px, `aria-current` on the open category, disabled while the editor is busy).
- **Evidence** — `pnpm verify` passed clean: 51 tooling tests, 831 unit tests (coverage thresholds met), 96 real PostGIS integration tests, OpenAPI regenerated and matching, knip/depcruise/trace clean, `pnpm audit --prod --audit-level high` clean (one pre-existing moderate `minimatch` advisory via eslint tooling, unrelated and below threshold). Targeted TDD: wrote `[MER-14:http]` and `[MER-14:authz]` tests for the PUT route first, watched all 4 fail with 404/409/415/400 instead of the expected statuses, then implemented until green. Added `[MER-14:env]` for the new env var (RED on the default/rejection assertions, then GREEN). Updated the `[AUTH-08]` authorization matrix and the OpenAPI path-list snapshot to include the new route.
- **Reviewer** — Self-reviewed per AGENTS.md §10 (no subagents available in this takeover run). No P0/P1 found: ownership/membership stays SQL-enforced in the reservation and adoption queries; the quarantine key is per-upload random and only ever deleted for a known replay/rejection, never on an unexplained exception; the new route sits in its own encapsulated Fastify sub-plugin so the custom content-type parser cannot leak into other JSON routes. Renamed two test fixture object keys (`quarantine/01234567/body` → a wordier non-hex string) after the gitleaks pre-commit hook flagged them as a false-positive generic API key; verified with `gitleaks protect --staged` before committing, hook never bypassed.
- **Next** — M2-7 Bulk prices: bind the preview to merchant/item revisions, apply rounded changes and history atomically, and prove the ten-minute undo window rejects an expired or since-changed price. Media milestone remainder: decode real HEVC HEIC in the worker (M2-6 third bullet) and connect the cropper UI (M2-6 fourth bullet) are still open.
- **Needs Mahdi** — None.

### 2026-11-07 19:25 GMT — M2-5 inline whole-dinar price editor

- **Changed** — Added a keyboard-accessible row price form in Arabic, French and English. Enter saves whole dinars and Escape cancels. Both restore focus. The command starts from the saved item and preserves translations, category, tags, prep time, photo reference and ordered option groups.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 804 unit and 86 real PostGIS integration tests. All 11 production HTTPS Chromium journeys passed. The price regression proved a fractional value did not save, Escape preserved the old value, and the exact price and attachments survived reload. The design critic approved 20 layout and validation captures. [Browser and design evidence](evidence/m2/inline-price.md)
- **Reviewer** — No P0/P1. Verified the existing session, revision and idempotency guards and separate drawer focus targets. Live photo writes remain part of M2-6.
- **Next** — Add category navigation to the wide menu workspace while building the private photo reservation and storage path.
- **Needs Mahdi** — None.

### 2026-11-07 19:20 GMT — M2-6 photo upload and variant contracts

- **Changed** — Defined strict upload reservations, session-scoped preparation and crop states, and complete ready manifests. Application uploads have no restaurant ID. Menu and profile uploads require one. Added standard Base64 ThumbHash and documented the bounded Linux HEVC decoder in D-007.
- **Evidence** — All five focused media contract tests passed. Staged `pnpm verify` passed 51 tooling, 798 unit and 86 real PostGIS integration tests. The Linux arm64 Docker probe decoded a synthetic HEVC fixture, rejected three invalid inputs, and generated 30 metadata-free WebP/AVIF variants across the three ratios.
- **Reviewer** — No P0/P1. Verified exact byte bounds, complete variant pairs, and private state shapes. Added the Expo-compatible ThumbHash regression and made quarantine cleanup and ready application privacy explicit.
- **Next** — Add tenant-scoped reservation persistence and the transactional preparation job. Wire the real HEVC fixture into amd64 CI before closing media.
- **Needs Mahdi** — None.

### 2026-11-07 19:13 GMT — M2-5 localized option library and shared attachments

- **Changed** — Added the Arabic, French and English option library, ordered item attachments, and restaurant and category context from the authorized menu response. Writes preserve option IDs, reject stale sessions and revisions, and retain the retry key after an uncertain response.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 793 unit and 86 real PostGIS integration tests. All 102 authorization tests and 11 production HTTPS Chromium journeys passed. The shared group and attachment order survived edits and reload on two items. The design critic approved all 32 views and 12 keyboard focus checks. [Browser and design evidence](evidence/m2/option-library.md)
- **Reviewer** — No P0/P1. Fixed the 20 px attachment picker and wrapped currency suffix, then verified the 44 px picker and one-line suffix at all audited sizes.
- **Next** — Add inline price editing and commit the media upload contracts. Customer preview remains part of the moderated onboarding journey.
- **Needs Mahdi** — None.

### 2026-11-07 19:03 GMT — M0 external P1 API log privacy

- **Changed** — Redact `phone`, `code`, `token`, `address`, and `location` at every depth after Pino serialization. Emit only the sanitized JSON, including when a later field shadows a sensitive child binding. The non-personal listener URL is logged as `listenAddress`.
- **Evidence** — The new logger tests reproduced nested, string and shadowed-binding leaks. All four passed after the fix. `pnpm verify` exited 0 with 47 tooling tests, 106 unit tests, 12 real PostGIS integration tests and all four M0 acceptance IDs. The production integration test found the renamed listener and verified live health, readiness and excluded debug routes.
- **Reviewer** — No P0/P1. Verified correlation IDs, serialized errors, child bindings and the live process diagnostic. [External review checklist](reviews/2026-11-07-m0.md)
- **Next** — Carry the fix into M1 and M2.
- **Needs Mahdi** — None.

### 2026-11-07 19:00 GMT — M1 external P1 order guard coverage

- **Changed** — Added 16 regressions for the ASAP timeout, scheduled time and release boundaries, pickup delivery-zone exemption, photo proof, failed code attempts, wait start, failure reason and call count. Pickup still requires the service area. The existing domain implementation passed every new case.
- **Evidence** — All 106 focused order transition tests passed. `pnpm gate m1` exited 0 with 50 tooling tests, 396 unit tests, 12 real PostGIS integration tests, 212 domain coverage cases, a 94.21% mutation score and four seeded 1,000-case properties.
- **Reviewer** — No P0/P1. Each new rejection reaches its intended guard with otherwise valid inputs. [External review checklist](reviews/2026-11-07-m1.md)
- **Next** — Carry the two review fixes into M2.
- **Needs Mahdi** — None.

### 2026-11-07 18:45 GMT — M2-5 option library repository and API

- **Changed** — Added private owner/manager option pages, details and revision-checked writes. An edit retains existing option IDs, generates IDs for new choices, preserves saved order and leaves item attachments intact.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 732 unit and 86 real PostGIS integration tests. All 102 authorization tests and generated OpenAPI passed. A composed API test attached one group to two items, updated it, and verified both links and exact replay. The guarded local migration applied the item and group command revisions.
- **Reviewer** — No P0/P1. Proved that a deferred cardinality failure rolls back the group, options, menu revision and receipt, and that concurrent identical commands produce one write and one replay.
- **Next** — Verify the localized library and attachment UI with the shared group flowing through two items.
- **Needs Mahdi** — None.

### 2026-11-07 18:41 GMT — M2-5 localized item editor

- **Changed** — Added category-scoped Arabic, French and English item creation, editing, duplicate, archive and stock controls. The form preserves ordered option attachments and shows moderation separately. Category rows link directly to their items.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 725 unit and 81 real PostGIS integration tests. All ten production HTTPS Chromium journeys passed. The item lifecycle covered exact DZD pricing, revisions, local midnight and reload persistence. The 16 normal and eight 200% design checks passed. [Browser and design evidence](evidence/m2/item-editor.md)
- **Reviewer** — No P0/P1. Fixed the split currency suffix and clipped stock options, then verified the corrected layout at all audited sizes. Restaurant and category context remains part of the combined builder.
- **Next** — Complete the reusable option-group library and item attachment controls, then media and preview.
- **Needs Mahdi** — None.

### 2026-11-07 18:33 GMT — M2-5 option library contracts

- **Changed** — Added strict option-group summary pages, details and revision-bound commands. Updates carry existing option IDs, new options omit them, and duplicate aliases are rejected. Temporarily sold-out defaults retain their configured preference.
- **Evidence** — All 12 menu contract tests passed. Staged `pnpm verify` passed 51 tooling, 693 unit and 81 real PostGIS integration tests.
- **Reviewer** — No P0/P1. Verified stable ID semantics, selection limits and unchanged item cursor behavior.
- **Next** — Implement tenant-scoped storage and attach reusable groups from the editor.
- **Needs Mahdi** — None.

### 2026-11-07 18:29 GMT — M2-5 item repository and API

- **Changed** — Added category-scoped item pages, session- and revision-bound editing, duplication, soft archive and narrow staff availability. PostGIS persists whole-dinar prices and ordered option attachments. Timed sell-out ends at the next Algiers midnight. Held moderation states survive text edits and duplication.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 690 unit and 81 real PostGIS integration tests. All 95 authorization tests and generated OpenAPI passed. Live API tests verified exact price persistence, archival replay, stale pages, staff-only stock changes and timed expiry.
- **Reviewer** — Closed the hold-reset issue with separate blocked and rejected PostGIS regressions. Both still contribute zero to checklist progress after editing and duplication. No remaining P0/P1.
- **Next** — Verify the localized editor and implement the reusable option-group library. Photo references become usable in M2-6.
- **Needs Mahdi** — None.

### 2026-11-07 18:17 GMT — M2-5 item editing contracts

- **Changed** — Defined strict item page, create, edit, duplicate, archive and sold-out contracts. Menu reads carry the session and revision. The availability command exposes only item ID, availability, deadline and revision.
- **Evidence** — All three focused item contract tests passed. Staged `pnpm verify` passed 51 tooling, 684 unit and 72 real PostGIS integration tests.
- **Reviewer** — No P0/P1. Verified the integer price bound and stale revision and archive shapes against PostgreSQL. Staff access will be limited to the dedicated sold-out operation.
- **Next** — Implement item persistence and API against these contracts, then verify the localized editor.
- **Needs Mahdi** — None.

### 2026-11-07 18:15 GMT — M2-4 localized setup checklist

- **Changed** — Added a private restaurant setup screen in Arabic, French and English, with stored hours, menu progress, status and menu navigation. Delivery zone, test order and Go live remain visibly unavailable until their required flows exist.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 681 unit and 72 real PostGIS integration tests. Nine production HTTPS journeys passed, including stored 0-to-5 item progress, overnight hours and staff denial. The 24 normal and eight 200% design variants passed. [Browser and design evidence](evidence/m2/onboarding-checklist.md)
- **Reviewer** — No P0/P1. Design review approved the native progress indicator, RTL, visible focus and unavailable activation state.
- **Next** — Continue item editing, reusable options, media, bulk changes, imports, hours, moderation and staff roles.
- **Needs Mahdi** — None.

### 2026-11-07 18:12 GMT — M2-4 stored onboarding progress

- **Changed** — Added the weekly-hours table and an owner/manager-only checklist read. It uses one database snapshot for saved hours and up to five configured items. Read responses, including tenant-dependent 404s, use `Cache-Control: no-store`.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 669 unit and 72 real PostGIS integration tests. The 89-test authorization suite and generated OpenAPI passed. Live tests proved the approval boundary, mixed-role denial, overnight hours and configured item eligibility. The worker migration required the explicit local development database URL in this checkout. With that URL, the guarded migration applied the menu and hours tables and retained 1,541 seeded communes.
- **Reviewer** — No P0/P1. Added a regression for caching a checklist denial across approval and set no-store before the scoped lookup.
- **Next** — Finish exact staged verification for the localized checklist.
- **Needs Mahdi** — None.

### 2026-11-07 18:05 GMT — M2-5 localized category editor

- **Changed** — Added bilingual category editing with Arabic, French and English UI, overnight availability, pointer and keyboard reordering, restored focus and localized announcements. The editor keeps commands bound to the loaded session and revision. The restaurant list links only eligible editors to it.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 664 unit and 70 real PostGIS integration tests. All eight HTTPS Chromium journeys passed. The category journey proved both reorder paths persist after reload and that staff cannot enter the editor. The 12-screen design matrix and four 200% checks passed. [Browser and design evidence](evidence/m2/category-editor.md)
- **Reviewer** — No P0/P1. Design review approved RTL, target size, accessible names and focus. The combined builder will add the active restaurant name above the menu.
- **Next** — Complete the onboarding checklist and add the item and reusable option group editors. Signup acceptance remains open through optional photo upload in M2-6.
- **Needs Mahdi** — None.

### 2026-11-07 18:01 GMT — M2-4 onboarding checklist contract

- **Changed** — Defined a strict session-scoped checklist response for approved restaurant editors. Menu progress counts up to five configured items. Zone and test order are unavailable at this stage, so the response keeps Go live disabled.
- **Evidence** — Both focused contract tests passed. Staged `pnpm verify` passed 51 tooling, 636 unit and 70 real PostGIS integration tests.
- **Reviewer** — No P0/P1. The contract refuses premature activation even when the profile, hours and five-item progress are complete.
- **Next** — Wire the tenant-scoped read to stored hours and menu items, then render the localized checklist.
- **Needs Mahdi** — None.

### 2026-11-07 17:56 GMT — M2-5 category repository and API

- **Changed** — Added session-bound category list, create, rename and reorder endpoints for owners and managers of eligible restaurants. Reads use a consistent snapshot and revision-bound keyset pages. Writes verify the target membership, preserve immutable results for retries, and apply order and revision atomically.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 634 unit and 70 real PostGIS integration tests. All 84 authorization tests and generated OpenAPI validation passed. Live API and repository tests cover replay, revision races, cursor invalidation and a single account with different roles across merchants.
- **Reviewer** — No P0/P1. Verified simultaneous identical retries and rejection after role downgrade. Added a contract and HTTP regression for malformed Unicode, which now receives 400.
- **Next** — Prove the localized category editor with keyboard and pointer on the optimized build. Continue menu items and reusable options.
- **Needs Mahdi** — None.

### 2026-11-07 17:44 GMT — M2-2 menu schema and category API contracts

- **Changed** — Added menu revision, categories, items, reusable option groups and ordered attachments. Composite foreign keys keep menu records in their merchant. A deferred constraint validates option counts and defaults at transaction commit. Category reads use revision-bound keyset pages and writes require an expected revision.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 622 unit and 64 real PostGIS integration tests. The five focused schema tests cover cross-merchant references, deferrable reordering, rollback and a concurrent option-default conflict.
- **Reviewer** — No P0/P1. Independently verified repeatable-read and read-committed writes, targeted cascades, migration reruns and cursor bounds.
- **Next** — Implement owner/manager category queries, revision checks and idempotent commands against the committed contracts.
- **Needs Mahdi** — None.

### 2026-11-07 17:40 GMT — M2-3 localized signup and review

- **Changed** — Added public restaurant signup, Arabic/French/English application status, allowlisted sign-in continuations and a French/English review queue. Bound application and admin decisions to the session that loaded the form. Retained the application key through throttling and formatted Algerian phone numbers in the review detail.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 620 unit and 59 real PostGIS integration tests. All seven HTTPS journeys passed, including separate approval/rejection, stale account and lost-response regressions. The 48-screen design matrix, eight 200% text checks and 35 existing visual checks passed. `pnpm db:seed` seeded the local Docker development database with 69 wilayas, 1,541 communes and 57 boundaries. [Browser and design evidence](evidence/m2/merchant-application.md)
- **Reviewer** — Closed stale applicant and admin session binding and the duplicate submission risk after a lost response and 429. Design review caught phone formatting and text scaling, both corrected and verified on the staged build.
- **Next** — Finish the menu schema and implement owner/manager category, item and option editing. Optional signup photos follow M2-6.
- **Needs Mahdi** — None.

### 2026-11-07 17:27 GMT — M2-2 menu write contracts

- **Changed** — Added strict category, category reorder, item and reusable option group inputs. They require Arabic or French content, whole-dinar prices, unique ordered group attachments and valid option selection limits. A temporarily sold-out option can retain its default preference.
- **Evidence** — Four contract tests passed. Staged `pnpm verify` passed 51 tooling, 566 unit and 59 real PostGIS integration tests.
- **Reviewer** — No P0/P1. The reviewer checked bilingual input, overnight availability, price bounds and option cardinality against MER-09 and MER-10.
- **Next** — Build tenant-scoped persistence and HTTP commands against the input contracts.
- **Needs Mahdi** — None.

### 2026-11-07 17:23 GMT — M2-3 geography seed

- **Changed** — Added the nationwide bilingual reference catalog and seeded Algiers boundaries with pinned provenance. The guarded local seed upserts the fixtures atomically without replacing commune IDs.
- **Evidence** — Docker Engine 29.9.2 and Compose v5.6.1 reported PostGIS, Martin and OSRM healthy. Staged `pnpm verify` passed 51 tooling, 562 unit and 59 real PostGIS integration tests. The fixture generator reproduced all three checked-in files and the runtime tests proved repeatability and rollback. [Geography evidence](evidence/m2/geography.md)
- **Reviewer** — No P0/P1. Verified the source license and attribution, source hashes, byte-for-byte replay, and lack of positive-area overlap between Algiers polygons.
- **Next** — Use the official communes in the localized restaurant application and admin review browser journey.
- **Needs Mahdi** — None.

### 2026-11-07 17:21 GMT — M2-3 merchant HTTP

- **Changed** — Published the commune, merchant application, own membership, admin queue and admin review routes. Each declares an explicit policy and uses the authenticated account for scoped queries. Optional application photos are deferred to M2-6.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 559 unit and 57 real PostGIS integration tests on Docker Desktop. `pnpm test:authz` passed 70 tests and `pnpm --filter @zaafran/api openapi:check` passed. The live API test rejected an out-of-commune pin, replayed an application without duplicates, hid the applicant’s membership from another account, and recorded one audit row for a retried approval.
- **Reviewer** — No P0/P1 findings in authorization, idempotency or cache behavior. Regenerated OpenAPI to close the stale contract finding and verified the exact staged artifact.
- **Next** — Seed the official geography and complete the localized application and review journeys.
- **Needs Mahdi** — None.

### 2026-11-07 17:16 GMT — M2-1 device management

- **Changed** — Added localized device sessions for Arabic, French and English, with per-device revocation, current-device sign-out and sign-out everywhere. The screen keeps the route across locale changes and never exposes a session token.
- **Evidence** — Staged `pnpm verify` passed 51 tooling, 528 unit and 56 real PostGIS integration tests. `pnpm test:e2e:auth --fail-on-flaky-tests` passed four HTTPS journeys on the compiled app and Docker PostGIS. The device journey revoked a remote session while preserving the current one, then verified sign-out everywhere. A second account stayed authenticated when a stale browser tab tried to sign out the first account. All twelve theme, locale and viewport captures passed axe and overflow. [Device evidence](evidence/m2/device-sessions.md)
- **Reviewer** — The design critic approved the corrected revoke control and the full matrix. Its accessible name preserves the visible label and the device context. The logout command now checks the displayed session ID against the authenticated session before revoking any devices.
- **Next** — Continue the merchant HTTP and localized onboarding work.
- **Needs Mahdi** — None.

### 2026-11-07 17:04 GMT — M2-2 merchant persistence and query contracts

- **Changed** — Added the forward merchant migration and atomic signup, membership, review notice, audit and idempotency transactions. Commune pin validation uses PostGIS `ST_Covers`. Admin and commune queries use bounded keyset pages.
- **Evidence** — The staged `pnpm verify` passed with 51 tooling, 508 unit and 56 real PostGIS integration tests. The focused merchant suite passed all 15 cases, including the transactional rollback, UUID alias race, lock order and same-millisecond review pagination. All 18 merchant and admin schema tests passed.
- **Reviewer** — Fixed lock inversion with TOTP, advisory lock divergence for UUID aliases and review cursor precision. Each had a real Postgres reproduction. No remaining P0/P1 in this slice.
- **Next** — Wire and test the merchant HTTP routes, then build the localized application and review screens.
- **Needs Mahdi** — None.

### 2026-11-07 16:46 GMT — M2-2 and M2-3 merchant contracts

- **Changed** — Added strict merchant application, commune page, membership and admin review schemas. Applicants cannot supply the account identity, phone, membership role or resulting status.
- **Evidence** — The two contract suites failed before the schemas existed. All 15 cases now pass. The staged `pnpm verify` passed with 51 tooling, 505 unit and 41 real PostGIS integration tests.
- **Reviewer** — Reproduced PostgreSQL rejecting embedded NUL characters. The affected names, registration number and review reason now reject them at validation. No remaining P0/P1 in the contract slice.
- **Next** — Prove merchant and owner creation, pin containment, tenant membership scope and audited admin review in Postgres. The verified national labels and codes will be paired with boundary data whose commercial reuse terms are clear.
- **Needs Mahdi** — None.

### 2026-11-07 16:43 GMT — M2-1 production-built browser auth

- **Changed** — Added a dedicated Playwright suite with optimized Next.js, the compiled API, local HTTPS, and disposable PostGIS. SMS and the injected clock stay inside the test process. CI runs the suite in its database-backed Verify job.
- **Evidence** — `pnpm test:e2e:auth --fail-on-flaky-tests` passed both real journeys. It proved Arabic phone formatting and E.164 storage, cookie attributes, cross-origin rejection, and French admin TOTP focus and twelve-hour expiry alongside a still-active customer. `pnpm test:e2e --grep @smoke --fail-on-flaky-tests` passed all 59 foundation cases. [Sign-in evidence](evidence/m2/sign-in.md)
- **Reviewer** — The browser registration is now visible to acceptance tracing. `TRACE_MILESTONE=m2 pnpm trace` recognizes I18N-04 and reports 28 of 37 IDs as the merchant features are developed.
- **Next** — Commit merchant signup and review contracts, build merchant persistence, and add the device-management screens.
- **Needs Mahdi** — None.

### 2026-11-07 16:37 GMT — M2-1 authentication and localized sign-in

- **Changed** — Added forward PostgreSQL auth migrations, transactional phone OTP and TOTP, hashed sessions, same-origin cookie protection, scoped device revoke, OpenAPI endpoints, and Arabic/French/English sign-in. The generated contract and authorization matrix include the new routes.
- **Evidence** — The final staged snapshot passed `pnpm verify` with 51 tooling, 490 unit and 41 real PostGIS integration tests. API line coverage reached 93.42% and web component line coverage reached 76.11%. `pnpm test:authz` passed all 38 cases. [Sign-in visual evidence](evidence/m2/sign-in.md)
- **Reviewer** — Fixed lost SMS delivery acknowledgement, repeat verification consuming attempts, receipt allocation on unchanged challenges, short TOTP seeds and admin focus announcements. No remaining P0/P1 in the reviewed auth and sign-in scope.
- **Next** — Finish and verify the production-built HTTPS browser harness, then commit merchant signup and approval contracts.
- **Needs Mahdi** — None for this slice. Real SMS provisioning remains a launch item in HUMAN_TODO.

### 2026-11-07 16:03 GMT — M2-1 authentication contracts and gate requirements

- **Changed** — Refined M2 into implementation slices and recorded the AUTH-09 choice in D-005. Added strict phone OTP, TOTP, logout and session schemas. The M2 gate rejects omitting onboarding, authorization or design checks.
- **Evidence** — The auth and gate regressions failed before implementation. The final `pnpm verify` passed 51 tooling, 396 unit and 12 real PostGIS integration tests, with 20/20 acceptance IDs traced through M1. The focused suites passed all 16 auth and 15 gate tests.
- **Reviewer** — Confirmed the replay response preserves the original expiry and resend deadlines and Bearer tokens use canonical Base64url. No remaining P0/P1 in the contract slice.
- **Next** — Write real Postgres tests for OTP and session transactions, then implement the auth persistence and HTTP wiring.
- **Needs Mahdi** — None.

### 2026-11-07 15:53 GMT — M1 gate passed

- **Evidence** — `pnpm gate m1` exited 0 on clean `1d43c1cf279e30e2771a4fd216df23ab884473e6`. `pnpm exec node scripts/check-pr.ts` confirmed all required checks passed for the same commit. GitHub Actions reproduced the 92.65% mutation score and all 20 required acceptance IDs. [Gate and job evidence](evidence/m1/gate.md) · [M1 PR](https://github.com/Mahdi-Lalioui/delivery/pull/2)
- **Reviewer** — No remaining P0/P1 after the lifecycle, schedule, copy lint and generated cache regressions passed.
- **Next** — M2 auth contracts, tenant-scoped persistence and merchant onboarding.
- **Needs Mahdi** — None for M1.

### 2026-11-07 15:48 GMT — M1-3 scheduling and local M1 gate

- **Changed** — Added Algiers civil hours, overnight and special-date precedence, busy pauses, 15-minute slots and Ramadan offsets, countdown and Iftar arrival. Extended order guard tests from the mutation review.
- **Evidence** — `pnpm gate m1` exited 0 on Docker Desktop. It ran 50 tooling, 380 unit, 12 real PostGIS integration and 196 domain coverage cases. Coverage reached 99.26% lines and 98.87% branches, Stryker scored 92.65%, four seeded properties ran 1,000 cases each, and the trace covered all 20 required IDs. [Local reports](evidence/m1/gate.md)
- **Reviewer** — Fixed offering an unusable current-time slot and closed historical calendar inputs outside the supported era. Verified the generated pnpm store exclusion and the workspace dependency rules. No remaining P0/P1.
- **Next** — Push the M1 snapshot and verify GitHub Actions on the PR head.
- **Needs Mahdi** — None.

### 2026-11-07 15:46 GMT — M1-4 search, M1-5 zone and M1-6 localization

- **Changed** — `637963d` added the cross-script search keys and 19 synonym groups, locale formatters and ICU messages, the geo adapter and polygon coverage, and shared CI checks for domain coverage, properties, and mutation analysis.
- **Evidence** — The staged snapshot passed `pnpm verify` with 49 tooling, 322 unit and 12 real PostGIS integration tests. Targeted checks proved 1,000 seeded normalization cases, all six Arabic ICU plural forms, polygon boundaries and holes, and all 59 Maghrib reference dates within one minute.
- **Reviewer** — Fixed missing JSX accessibility copy and visible submit, button and reset values, including uppercase and static template input types. The tooling regression and focused lint passed. No remaining P0/P1 in these changes.
- **Next** — Verify the complete M1 assembly with the scheduling and Ramadan rules.
- **Needs Mahdi** — None.

### 2026-11-07 15:39 GMT — M1-2 order lifecycle and M1-5 ETA

- **Changed** — `ee11491` added order state and scope checks, exact retries, event projection, delivery proof, deadlines and ETA ranges and refresh limits.
- **Evidence** — The staged snapshot passed `pnpm verify` with 48 tooling, 231 unit and 12 real PostGIS integration tests. The order and ETA suite passed 77 focused cases, including a seeded 1,000-run command-sequence property.
- **Reviewer** — Fixed and verified two P1 cases. Events now exclude extra action fields. A stale fresh command returns the version conflict even after a different command reached a terminal state. No remaining P0/P1.
- **Next** — Verify the search, locale, and geo packages together.
- **Needs Mahdi** — None.

### 2026-11-07 15:32 GMT — M1-1 integer pricing and cash change

- **Changed** — `914b97b` added branded DZD, integer line and option calculations, discount and fee rounding, minimum checks, cash change, and the M1 coverage and mutation command wiring.
- **Evidence** — The staged snapshot passed `pnpm verify` with 48 tooling, 154 unit and 12 real PostGIS integration tests. The domain pricing suite includes a seeded 1,000-run independent bigint oracle.
- **Reviewer** — No P0/P1. Added a regression for a negative adjusted line hidden by another positive line.
- **Next** — Prove the order transition and receipt contracts.
- **Needs Mahdi** — None.

### 2026-11-07 — M0 gate passed

- **Evidence** — `pnpm gate m0` exited 0 on Docker Desktop for clean PR head `acf1db5`. All five required Actions checks passed. The gate also reran 47 tooling, 102 unit, 12 real PostGIS integration, 59 browser and 59 contrast checks with 4/4 traced acceptance IDs. [Gate evidence](evidence/m0/gate.md) · [M0 PR](https://github.com/Mahdi-Lalioui/delivery/pull/1)
- **Clean checkout** — QA ran a frozen install from a fresh store, full verify and 59-case browser smoke at `acf1db5`. All exited 0 and the checkout stayed clean.
- **Review** — No open P0/P1. The design critic approved both screens at all required sizes. The audit reports one moderate tooling advisory within the high-severity gate.
- **Next** — M1 domain core, beginning with DZD arithmetic and pricing property tests.
- **Needs Mahdi** — None for M0. The Docker Desktop stack is healthy.

### 2026-11-07 15:10 GMT — M0 verified foundation commits

- **Changed** — Committed the health and problem contracts in `1f3d727` and the foundation implementation in `ce3adc6` on `m0-foundations`. The installed pre-commit hook ran formatting, ESLint and Gitleaks on both commits with zero leaks.
- **Evidence** — Fresh frozen install and `pnpm verify` exited 0 with 47 tooling, 102 unit and 12 real PostGIS integration tests, API line coverage 85.84%, web component line coverage 76.47%, and all 4 M0 acceptance IDs. See [verification evidence](evidence/m0/verification.md).
- **Evidence** — `pnpm test:e2e --grep @smoke` passed all 59 cases with 32 axe and overflow checks. The design critic found no fixes after reviewing the full matrix. The 35 WebPs match their source captures.
- **Evidence** — `pnpm dev` started web, API and worker together on Docker Desktop. HTTP probes returned health and readiness 200, the Arabic guide 200, and the loopback-only fake inbox. The development web listener was confirmed at `127.0.0.1:3000`. Watch processes were stopped after verification.
- **Reviewer** — No remaining P0/P1. The final rate-limit regression passed with 401, 401, 429 and only two actor resolutions.
- **Next** — Reproduce from a clean clone and verify all required GitHub Actions checks on the M0 PR head. Then run and record `pnpm gate m0`.

### 2026-11-07 15:03 GMT — M0 foundations verification on Docker Desktop

- **Evidence** — `pnpm verify` exited 0 with 47 tooling tests, 101 unit tests, 12 real PostGIS integration tests, 85.58% API line coverage, 76.47% web component line coverage, and 4/4 required M0 acceptance IDs traced. Formatting, lint, typecheck, production build, generated OpenAPI, Knip and dependency boundaries passed. The production audit found one moderate advisory in the tooling dependency minimatch and no high or critical advisories. [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- **Reviewer** — Real tests reproduced skipped trace registrations, auth hook ordering, missing application schema during readiness, and concurrent migrations. The fixes include runner-shared discovery, authorization ahead of route hooks, app and worker schema checks, and a transaction advisory lock around the migrator. A final rate-limit ordering regression now verifies the limiter runs before the actor resolver. Rerun full verify and review on the final snapshot.
- **Next** — Finish the full DESIGN §14 screenshot matrix, verify and commit the foundation snapshot, then check the exact PR head in GitHub Actions.

### 2026-11-07 15:02 GMT — M0-4 and M0-5 real Compose and database

- **Changed** — Added root Compose for PostGIS, Martin and OSRM, a synthetic PMTiles tile, an attributed Algiers road fixture, guarded development database commands and isolated test database clones.
- **Evidence** — `bash infra/verify-dev-compose.sh` exited 0 on Docker Desktop. PostgreSQL 18.6 and PostGIS 3.7.0 answered over TCP. Martin returned a 29-byte vector tile. OSRM found an 873.8 m route in 90.2 s. See [Compose and database evidence](evidence/m0/compose-database.md).
- **Evidence** — The concurrency regression reproduced SQLSTATE 23505 before the migrator lock. Afterward, 6/6 database integration tests passed and all four disposable databases were removed. The development migrate, seed and confirmed reset commands also passed on a disposable container.
- **Needs Mahdi** — Docker is ready. The temporary runtime was stopped and the Desktop Compose stack is running.

### 2026-11-07 14:58 GMT — M0-8 through M0-10 web shell and smoke tests

- **Changed** — Added ar/fr/en document shells, RTL, cookie and header negotiation, localized metadata, the isolated pseudo-locale and design guide, four self-hosted font families, CSP nonces, and token-generated light/dark themes. Ordinary production builds exclude the guide files.
- **Evidence** — The first browser run exposed missing localized titles and WebKit's missing Resource Timing entries despite successful font fetches. After adding metadata and using actual font responses plus loaded families, `pnpm test:e2e --grep @smoke` exited 0 with 39/39 cases, zero skips or flakes, and zero axe violations in the 12 guide matrix cases.
- **Evidence** — 58 DESIGN contrast pairs passed with a low-contrast rejection fixture. Six streamed React tests used the real translations and reached 76.47% web component line coverage.
- **Next** — DESIGN §14 also requires the public home and tablet images, 1280×800 desktop evidence, and compressed WebP output. The expanded matrix is being added.

### 2026-11-07 14:52 GMT — M0-6, M0-7 and M0-11 API, worker and CI

- **Changed** — Added health and problem response contracts and a generated OpenAPI document. The API has startup validation, request IDs, redacted logs, an explicit authorization matrix and rate limiting. Test endpoints and the fake outbox stay outside the production artifact. The worker uses Graphile revision 20 and a durable transactional effect ledger.
- **Evidence** — The built API returned 404 for all debug paths. Worker tests proved five real PostgreSQL cases, including duplicate concurrency, rollback and retry, a real queued watchdog and graceful acknowledgement. The compiled worker also handled SIGTERM while a job was active and exited 0.
- **Evidence** — Workflow syntax passed actionlint. The isolated pre-commit test blocked an ESLint violation and a synthetic credential with redaction. The PR gate rejects dirty worktrees, mismatched heads, skipped checks and missing security checks. GitHub Actions verification awaits the M0 PR.

### 2026-11-07 14:22 GMT — M0-1 to M0-3 workspace and gate checks

- **Changed** — D-001 records registry and upstream release pins. Added the pnpm/Turbo workspace, strict TypeScript, ESLint, Vitest, Prettier, dependency boundaries, root commands, acceptance trace, and milestone gate runner.
- **Evidence** — Node v26.13.0 and pnpm 12.18.0 ran together from the checksum-verified temporary Node installation. `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` and `pnpm knip` passed on the initial workspace. The four tooling checks and 25 gate and trace checks passed after the failing-first runs.
- **Reviewer** — Review found two P1s in M0-3. Regression tests now cover disabled or empty test registrations and missing mandatory gate checks. Also fixed TS versus TSX filename handling and the pnpm child process launch. Follow-up review pending.
- **Gate status** — `pnpm gate m0` invoked the full verification command and exited 1 at Vitest because app and package test files are still being built. `pnpm trace --through m0` exited 1 for the four missing M0 acceptance proofs and reported 157 future IDs.
- **Next** — Real Compose service fixtures, database migrations and isolated PostGIS integration tests.

### 2026-11-07 14:21 GMT — Isolated Docker and browser prerequisites

- **Changed** — Downloaded verified host tools into temporary directories and started an isolated Lima VM. The repository is mounted read-only in the guest.
- **Evidence** — `docker info` reported rootless Docker Engine 29.9.3 on the arm64 guest. `docker compose version` reported v5.7.0. Running `postgres --version` inside the digest-pinned amd64 PostGIS image via Rosetta exited 0 and reported PostgreSQL 18.6. See [runtime evidence](evidence/m0/environment.md).
- **Evidence** — `pnpm exec playwright install chromium webkit` and `pnpm exec playwright install --list` exited 0 with Playwright 1.65.0, Chromium revision 1254, and WebKit revision 2388 in the temporary browser cache. The test runner has not started a browser journey yet.
- **Needs Mahdi** — None for this session's runtime. A durable Docker installation remains listed in HUMAN_TODO.

### 2026-11-07 — Brief baseline and external-review rule

- **Changed:** Published the original brief on `main` in `ee27372` and switched to `m0-foundations` for implementation. Added the external-review rule to AGENTS §3. Refined M0 in PLAN.
- **Evidence:** Compared every staged file byte for byte against the starter archive and verified the index held exactly the 15 requested files, including all 11 role definitions. `git push -u origin main` exited 0. `git ls-remote --exit-code origin refs/heads/main` returned `ee27372`.
- **Evidence:** `git diff --check` passed. `pnpm verify` exited 1 because the bootstrap has no package manifest yet.
- **Reviewer:** No P0/P1. M0-4 now explicitly preserves the documented root `docker compose up -d db` entry point.
- **External reviews:** No review directory or open items existed at the branch setup check.
- **Next:** M0-1 version pins.

### 2026-11-07 14:02 GMT — M0 environment and repository preflight

- **Changed:** Cloned `Mahdi-Lalioui/delivery` into `delivery/` inside the supplied workspace and imported the source-of-truth files and specialist role definitions from the starter archive.
- **Evidence:** `git clone` exited 0 and reported an empty remote. `gh repo view` reported a public repository with no default branch ref. `gh auth status` succeeded through the host keyring outside the sandbox. Git is 2.54.0.
- **Evidence:** `node --version` reported v24.18.0 in the initial shell and v24.16.0 in the checkout shell. `pnpm --version` reported 11.25.0 and `corepack --version` 0.35.0. The scout will verify the current LTS patch before it is pinned.
- **Evidence:** `docker compose version` exited 127 in both shells. No supported container runtime or Postgres executable was found. The Playwright browser cache is absent and `pnpm exec playwright --version` exited 1 because the checkout has no package manifest yet. `df -h .` reported 801–802 GiB free on macOS arm64.
- **Next:** Refine M0 in PLAN, then verify and record the toolchain pins before adding dependencies.
- **Needs Mahdi:** See Docker setup in HUMAN_TODO. Continue with version research, workspace tooling and test authoring in parallel.

## Current status

- Milestone: M1 (last passing gate, M2 in progress)
- The checklist snapshot reran `pnpm gate m2` on 2026-11-07 at 18:14 GMT and exited 1 at acceptance trace. It covered 28 of 37 IDs. Pending IDs are ADM-04, MER-01, MER-10, MER-11, MER-12, MER-14, MER-15, MER-16 and MER-23. MER-11's apply/history and undo endpoints landed at 22:41 and 23:18 GMT; the merchant UI is still needed to close MER-11.
- Last green `pnpm verify`: 2026-11-07 23:33 GMT on Docker Desktop with 935 unit and 109 PostGIS integration tests
- Open HUMAN_TODO items: see docs/HUMAN_TODO.md
