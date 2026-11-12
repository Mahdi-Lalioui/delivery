# DECISIONS

Short entries, newest last. A decision that replaces an older one says `Supersedes D-xxx`.

## Template

### D-xxx — <title> (YYYY-MM-DD)
- **Context:** why a decision was needed
- **Decision:** what we chose
- **Alternatives:** what we rejected and why (one line each)
- **Consequences:** what this makes easier or harder

---

### D-000 — Decisions already made by Mahdi (2026-11-07)
- **Context:** product and business choices made before the build started.
- **Decision:**
  - web first, then native apps straight after;
  - Algiers first, nationwide later;
  - restaurants pay a flat monthly fee (default 5 000 DZD, first month free, no commission);
  - restaurants' own drivers in v1, our own riders in phase 2;
  - groceries in phase 2;
  - medicines never.
- **Alternatives:** per-order commission (rejected: restaurants hate it and it is the competitors' model).
- **Consequences:**
  - no payouts or money custody in v1;
  - the platform earns from subscriptions, so restaurant success and retention are the core metric.

### D-001 — Pinned versions (2026-11-07)

The scout checked stable releases with `npm view <package> version` and peer and engine ranges with `npm view <package>@<version> engines peerDependencies --json`. The pins below are the M0 baseline. Add each dependency to the workspace when its first use lands. Use the lockfile for transitive versions. [npm registry](https://registry.npmjs.org/)

| Scope | Exact pins |
|---|---|
| Runtime | Node `26.13.0` (Lithium LTS), bundled npm `11.20.0`, pnpm `12.18.0`, Turborepo `2.11.10` |
| TypeScript and lint | `typescript` `6.0.3`, `@types/node` `26.6.6`, `eslint` `10.14.0`, `@eslint/js` `10.0.1`, `typescript-eslint` `8.72.1`, `eslint-config-next` `16.4.5`, `eslint-config-prettier` `10.1.8`, `prettier` `3.9.10` |
| Workspace checks | `knip` `6.44.2`, `dependency-cruiser` `18.7.2`, `lint-staged` `17.6.0`, `tsx` `4.23.15`, `yaml` `2.9.1` |
| Web framework | `next` `16.4.5`, `react` and `react-dom` `19.3.1`, `@types/react` and `@types/react-dom` `19.3.0`, `babel-plugin-react-compiler` `1.0.0`, `tailwindcss` and `@tailwindcss/postcss` `4.3.5`, `postcss` `8.5.32`, `next-intl` `4.14.9` |
| Web UI and data | `motion` `14.10.1`, `three` and `@types/three` `0.187.0`, `@react-three/fiber` `9.8.2`, `@react-three/drei` `10.7.9`, `maplibre-gl` `6.16.0`, `@tanstack/react-query` `5.107.1`, `zustand` `5.1.0`, `react-hook-form` `7.91.0`, `@hookform/resolvers` `7.0.3`, `lucide-react` `1.70.0` |
| Radix and PWA | `radix-ui` `1.8.1`, `@radix-ui/react-dialog` `1.3.1`, `@radix-ui/react-dropdown-menu` `2.2.1`, `@radix-ui/react-popover` `1.3.1`, `@radix-ui/react-tooltip` `1.4.1`, `@radix-ui/react-slot` `1.5.0`, `serwist` and `@serwist/turbopack` `9.5.13` |
| API and contracts | `fastify` `5.12.8`, `fastify-type-provider-zod` `7.0.0`, `@fastify/websocket` `11.3.7`, `@fastify/rate-limit` `11.2.2`, `@fastify/swagger` `9.9.3`, `openapi-types` `12.1.3`, `pino` `10.4.0`, `zod` `4.6.7` |
| Database and worker | `drizzle-orm` `0.45.4`, `drizzle-kit` `0.31.11`, `postgres` `4.1.0`, `graphile-worker` `0.18.0` |
| Media, locales and notifications | `sharp` `0.35.5`, `thumbhash` `0.1.1`, `open-location-code` `1.0.3`, `libphonenumber-js` `1.13.15`, `adhan` `4.4.6`, `web-push` `4.0.0`, `expo-server-sdk` `8.0.0` |
| Web tests | `vitest` and `@vitest/coverage-v8` `5.1.0`, `vite` `8.3.6`, `fast-check` `4.10.2`, `@testing-library/react` `16.3.3`, `@testing-library/dom` `10.4.2`, `@testing-library/user-event` `14.6.8`, `@testing-library/jest-dom` `7.0.1`, `jsdom` `31.0.0`, `msw` `3.0.4`, `@playwright/test` `1.65.0`, `@axe-core/playwright` `4.14.0` |
| Quality tooling | `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` `10.1.1`, `@lhci/cli` `0.16.0`, `size-limit`, `@size-limit/file` and `@size-limit/preset-app` `14.3.0` |
| Expo SDK 58 | `expo` `58.0.23`, `react-native` and `@react-native/jest-preset` `0.88.1`, React and React DOM `19.3.0`, `expo-router` `58.0.30`, `babel-preset-expo` `58.0.24`, `react-native-reanimated` `4.7.1`, `react-native-worklets` `0.13.0`, `react-native-safe-area-context` `5.11.1`, `react-native-screens` `4.30.1` |
| Native tests | `jest` `30.5.2`, `jest-expo` `58.0.14`, `@testing-library/react-native` `14.1.0`, `test-renderer` `1.3.1` |
| Map tooling | `pmtiles` `4.5.0`, `@protomaps/basemaps` `5.7.2`, `@mapbox/mapbox-gl-rtl-text` `1.0.0` |

M1 adds direct pins for `intl-messageformat` `11.2.15` and `@formatjs/icu-messageformat-parser` `3.5.22`, previously in the lockfile through the web i18n stack. Both exact npm releases were verified. They report BSD-3-Clause and MIT respectively. [ICU formatter registry entry](https://registry.npmjs.org/intl-messageformat/11.2.15) · [ICU parser registry entry](https://registry.npmjs.org/@formatjs%2ficu-messageformat-parser/3.5.22)

TypeScript `7.0.2` is the latest stable release. The selected type-aware ESLint parser declares `>=4.8.4 <6.1.0`, so `6.0.3` is the supported pin. Expo uses the SDK bundle's React and native versions in the app workspaces. Select the Serwist adapter for Next's Turbopack build. [typescript-eslint support](https://typescript-eslint.io/users/dependency-versions/) · [Expo SDK 58](https://expo.dev/changelog/sdk-58) · [Serwist Next.js documentation](https://serwist.pages.dev/docs/next/getting-started)

The official Darwin arm64 Node archive matched `SHASUMS256.txt`. `node --version` and `pnpm --version` then returned `v26.13.0` and `12.18.0` together. The temporary npm bootstrap exempted the exact pnpm pin from the host's three-day release-age window. [Node release index](https://nodejs.org/dist/index.json) · [Node checksums](https://nodejs.org/dist/v26.13.0/SHASUMS256.txt) · [npm release-age settings](https://docs.npmjs.com/cli/v11/using-npm/config/#min-release-age)

| Service | Exact release and OCI index digest |
|---|---|
| PostgreSQL 18.6 and PostGIS 3.7.0 | `postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de` |
| Martin 1.16.0 | `ghcr.io/maplibre/martin:1.16.0@sha256:caa63e4618ef8f326141d1a867d6ee15bddcf649260c979193bbf487b433a7e0` |
| OSRM 26.11.0 | `ghcr.io/project-osrm/osrm-backend:v26.11.0-debian@sha256:e1929ae2818226284d7ef007329098a30851c11528ab3712bc9c8d68da78278b` |
| Caddy 2.11.9 | `caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee` |
| Node 26.13.0 | `node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072` |

The PostGIS image supplies `pg_trgm` and `unaccent` from PostgreSQL and publishes a Linux amd64 build. Compose selects that architecture on Apple silicon. Martin and OSRM publish amd64 and arm64 builds. [PostgreSQL release series](https://www.postgresql.org/support/versioning/) · [PostGIS release news](https://postgis.net/news/) · [PostGIS images](https://github.com/postgis/docker-postgis) · [Martin releases](https://github.com/maplibre/martin/releases/tag/martin-v1.16.0) · [OSRM releases](https://github.com/Project-OSRM/osrm-backend/releases/tag/v26.11.0) · [Caddy releases](https://github.com/caddyserver/caddy/releases/tag/v2.11.9)

| Executable | Exact pin | Source |
|---|---|---|
| Docker Compose | `5.7.0` | [Compose releases](https://github.com/docker/compose/releases/tag/v5.7.0) |
| Protomaps extract CLI | `go-pmtiles` `1.31.2` | [Protomaps releases](https://github.com/protomaps/go-pmtiles/releases/tag/v1.31.2) |
| Optional geocoder | Nominatim `5.3.3` | [Nominatim releases](https://github.com/osm-search/Nominatim/releases/tag/v5.3.3) |
| Load tests | k6 `2.3.0` | [k6 releases](https://github.com/grafana/k6/releases/tag/v2.3.0) |
| Secret scanning | gitleaks `8.30.1` | [Gitleaks releases](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) |
| OpenAPI compatibility | oasdiff `1.35.0` | [oasdiff releases](https://github.com/oasdiff/oasdiff/releases/tag/v1.35.0) |
| Mobile journeys | Maestro CLI `2.12.1` | [Maestro releases](https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.12.1) |

Use Protomaps basemap schema `4.15.2`. The `20261107.pmtiles` build declares BLAKE3 `e240cd798334494f95e502866e09a2e1ef2d3cd52338b716fb531ff2711ee8fc`. Record the checksum of the retained regional extract when it is generated. The dated Geofabrik `algeria-261106.osm.pbf` extract declares MD5 `dd9b2ae7171221de99646be1bac6c9fa`. [Protomaps builds](https://build.protomaps.com/) · [Geofabrik Algeria extracts](https://download.geofabrik.de/africa/algeria.html)

GitHub Actions and GHCR are hosted services. Pin workflow actions to the resolved commit for each selected release. Install the pinned MIT-licensed gitleaks CLI directly in CI and use it in the local staged hook. [GitHub Actions](https://docs.github.com/en/actions) · [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

| Action | Exact release | Commit |
|---|---|---|
| `actions/checkout` | `7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | `7.1.0` | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `actions/upload-artifact` | `7.0.2` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `pnpm/action-setup` | `6.1.1` | `73e46992e05b19abd31f2f3c20e0e7370d762115` |
| `github/codeql-action` | `4.39.3` | `33d7b85da1a04171e211befe2c739303b9a4c066` |
| `docker/login-action` | `4.8.0` | `8aa5831fb8d48d8f76594c7ddde61ae58019f550` |

### D-002 — M0 toolchain installation policy (2026-11-07)

Keep pnpm's default release-age and dependency build checks. pnpm recorded exact release-age exceptions for Knip 6.44.2 and the pinned Tailwind CSS 4.3.5 family during installation. Parcel Watcher 2.6.0, SWC 1.16.22 and esbuild 0.28.2 use the lockfile's prebuilt optional binaries. Their lifecycle scripts are explicitly denied. The frozen lockfile install passed after recording those decisions. [pnpm build settings](https://pnpm.io/settings/build#allowbuilds)

The clipped roads fixture was generated with Osmium Tool 1.18.0 (Debian `1.18.0-1`). The synthetic archive was verified with the pinned go-pmtiles executable. Regeneration tools run only when updating fixtures. [Debian Osmium package](https://packages.debian.org/trixie/osmium-tool)

### D-003 — Optimized web builds and font preloads (2026-11-07)

Build the M0 web and design profiles with Next.js 16.4.5's Webpack mode. The Turbopack build merged font imports across the Arabic and Latin layouts and omitted the preload for the compound guide extension. The Webpack artifacts preload only Inter on Latin routes and only the IBM Plex UI weights on Arabic routes. The display fonts load on demand. Supersedes the M0 bundler assumption in D-001. Select the matching Serwist adapter when the PWA work starts. [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next) · [Serwist Next.js documentation](https://serwist.pages.dev/docs/next/getting-started)

### D-004 — Maghrib reference and delivery ETA rounding (2026-11-07)

The default Algeria prayer calculation uses the Adhan Muslim World League profile with the published local three-minute sunset adjustment. The 2027 fixture uses USNO astronomical sunset for central Algiers plus that published adjustment. The adapter accepts a merchant-selected calculation profile and an independent minute offset. [USNO reference](https://aa.usno.navy.mil/calculated/rstt/year?ID=AA&year=2027&task=0&lat=36.7538&lon=3.0588&label=Algiers&tz=1&tz_sign=1) · [Ministry publication, p. 62](https://marw.gov.dz/sites/default/files/publications/ressalat_elmassjd-annee17-n02-1440h-2019.pdf)

Display delivery ETA endpoints rounded independently to the nearest five minutes, with halves rounded up. Tracking can compute its first ETA immediately and refresh at the next 30-second boundary. M5 supplies the live route and authoritative PostGIS coverage check.

Opening hours use the fixed UTC+01:00 Algiers calendar from 1982 onward. Special dates replace the local day's weekly openings and any prior-day spill. Scheduled slots begin after the current instant, include the three-day boundary, and reserve prep time before the end of a continuous opening. [IANA timezone data](https://data.iana.org/time-zones/tzdb/africa)

### D-005 — Postgres-backed authentication (2026-11-07)

Use the AUTH-09 fallback with the existing PostgreSQL and Node cryptography stack. The exact Better Auth and Expo releases checked were `1.7.18`. The phone plugin stores the code directly and compares strings. The session adapter stores the raw token. The built-in TOTP hook covers credential sign-in, while phone verification can issue a session directly. These paths fail the AUTH-01, AUTH-03 and AUTH-05 requirements. [Phone verification](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/better-auth/src/plugins/phone-number/routes.ts#L932-L967) · [Session adapter](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/better-auth/src/db/internal-adapter.ts#L725-L736) · [TOTP hook](https://github.com/better-auth/better-auth/blob/v1.7.18/packages/better-auth/src/plugins/two-factor/index.ts#L55-L59)

A single transaction protects challenge consumption and session issuance. The web contract keeps the session credential in the secure cookie. The native contract explicitly requests a Bearer credential. Administrative sessions require a separate TOTP step and expire after twelve hours. Tenant authorization binds the actor's role to the target merchant in SQL.

OTP delivery derives the code from the challenge ID with a keyed, separate HMAC domain. The database stores the verifier HMAC and delivery outcome. A retry of an interrupted send uses the same code and challenge ID, and concurrent retries serialize on the delivery row. The SMS adapter receives the challenge ID as its delivery key so a provider with idempotency support can deduplicate an ambiguous delivery response. Verification receipts retain keyed request fingerprints and outcomes. A consumed successful verification does not reissue a session credential on replay.

### D-006 — Official geography catalog and attributed boundaries (2026-11-07)

Seed national codes, wilaya assignments and bilingual labels from the MIT-licensed GeoAlgeria 2.4.1 catalog. Use the official gazette labels for Algiers. Derive all commune centroids and the 57 Algiers polygons from a dated OpenStreetMap extract under ODbL. Keep the source hashes, relation crosswalk, reproducible tools and attribution together. PostGIS checks submitted pins with the stored Algiers polygon. [Source and licensing record](../packages/db/fixtures/geography/README.md)

The local `db:seed` command migrates, then upserts the catalog in one transaction. Existing commune IDs survive repeat and concurrent seeds. Keep the repository's database-name guard for local commands.

### D-007 — Private photo preparation and bounded HEIC decoding (2026-11-07)

Reserve the photo against the signed-in owner and, for menu and profile media, the authorized restaurant. Upload the binary directly into private quarantine. A worker creates a sanitized preview so the browser can crop HEIC even when it cannot decode the original. Use a 16:9 crop for private application photos. Keep the preview and the original private, and delete the original after durable publication or deterministic rejection. Ready application variants remain authenticated. Accept the crop against the original session and expose the ready state after both formats exist at all five widths. Serialize ThumbHash as standard Base64 for the web and native readers.

The Sharp 0.35.5 prebuilt libvips 8.18.7 detected HEVC but did not decode its pixels. Build a decode-only primary-image helper against libheif 1.23.7 and libde265 1.1.3 in the pinned Linux image. Bound its process, decoded pixels and output, then feed raw RGBA to Sharp. Keep compiler and encoder tools out of the runtime. The verified release archive SHA-256 values are `f7483e818503ea6224c8863e4a56ac02c7089021a98472c811c12aa19faf2475` and `554228bd17788c99a7e63b37ab5634722190e6e2bf60c1dcb01cef328e133905`, respectively. [Sharp HEIF support](https://sharp.pixelplumbing.com/api-output/#heif) · [libheif release](https://github.com/strukturag/libheif/releases/tag/v1.23.7) · [libde265 release](https://github.com/strukturag/libde265/releases/tag/v1.1.3)

The Linux arm64 Docker probe decoded a generated 96×64 HEVC fixture and rejected truncated, forged oversized and mismatched files. It produced 30 metadata-free WebP and AVIF variants across the three ratios, and all three ThumbHashes decoded. Run the real fixture on the amd64 CI runner before closing the media task.

### D-008 — Bulk price apply recomputes from locked live prices (2026-11-07)

Bind a bulk price change to the merchant's menu revision (the existing optimistic-concurrency guard) rather than a separately stored preview snapshot. Preview is a read-only projection of the live prices; apply locks the same items `FOR NO KEY UPDATE`, recomputes the rounded change from their current stored price inside the write transaction, and only then updates `items.price_dzd`, inserts `price_history` and a `price_change_batches` row for the next undo task, and bumps the revision. A client never supplies an old or new price; the server is the sole source of the money calculation. `packages/db/src/menu-price.ts` also rejects any computed price above the `items.price_dzd` int4 ceiling (2 147 483 647) before it would otherwise overflow the column. Adds a first `@zaafran/domain` dependency to `@zaafran/db`, which required enabling `rewriteRelativeImportExtensions` in `apps/api/tsconfig.build.json` so its build can type-check through `@zaafran/db`'s re-exported domain types.
- **Alternatives:** store the previewed old/new prices and bind apply to that snapshot (rejected: lets a stale preview silently diverge from the live price, and duplicates the money calculation across two code paths).
- **Consequences:** any concurrent menu edit between preview and apply invalidates the whole batch via the existing revision conflict, forcing a fresh preview; no separate preview-expiry bookkeeping is needed.

### D-009 — Bulk price undo restores recorded prices under the menu revision guard (2026-11-07)

Undo is `POST /v1/merchants/:merchantId/menu/prices/batches/:batchId/undo`, an idempotent session-bound menu command (`bulk_price_undo`, migration `0011_menu_price_undo.sql`) that bumps the menu revision like every other editor write. Inside one transaction it locks the batch row `FOR UPDATE`, rejects an already-undone batch (`price_change_already_undone`) and one applied more than ten minutes before the injected clock (`undo_window_expired`, boundary inclusive, computed by the pure `isBulkPriceUndoOpen` in `@zaafran/domain`), then locks the batch's live items and rejects the whole undo if any item is archived or no longer holds the price the batch set (`price_changed_since_apply`). Otherwise it restores each recorded `old_price_dzd` and stamps `undone_at`. The client sends only the expected revision; restored prices come from `price_history`, never from the request. The original `price_history` rows stay unchanged, and `undone_at` records the reversal, so no second history row is written.
- **Alternatives:** partial undo of only the unchanged items (rejected: silently leaves the menu half-reverted); a new history batch for the reversal (rejected for now: `undone_at` already records the reversal and its time, and no screen reads a reversal row yet).

### D-010 — Opening-hours input bounds (2026-11-07)

`@zaafran/contracts/merchant-hours` describes MER-15 hours as exactly seven weekday entries (0 = Sunday, the M1 `hours.ts` convention) plus at most 60 special dates. Each day has at most four ranges, given as whole minutes, where opening is 0–1439 and closing is 0–1440. A closing minute at or before the opening minute means the range runs past midnight. Ranges on the same day must not overlap, and an empty special-date list closes that whole Algiers civil date. Four ranges cover split lunch/dinner/late service with room to spare. Sixty special dates cover a year of public and religious holidays without letting one request grow without bound.

`merchantRamadanInput` in the same module uses seven weekday entries of up to four ranges. Each endpoint is either Maghrib ± up to 720 minutes or a fixed Algiers clock minute, mirroring M1 `resolveRamadanRange`. It also takes an optional non-empty suhoor window, an adhan 4.4.6 calculation method name or `Algeria` (with `Other` excluded because it carries no angles), and a whole-minute prayer adjustment of at most ±30 minutes. Thirty minutes covers local sighting corrections. Larger shifts belong in the per-range Maghrib offset.

### D-011 — Hours writes share the menu guard (2026-11-08)

Opening hours, special dates and (next) the Ramadan schedule are written by the same people and in the same merchant states as the menu: an owner or manager (SPEC MER-23 gives managers everything except billing and staff) of an approved, active or paused merchant (MER-02 shows hours in the post-approval checklist). Writes therefore run through `runMenuCommand` with operation `hours_replace`, bumping `merchants.menu_revision` and recording a `menu_command_receipts` row, so hours get the same idempotency, stale-revision rejection and SQL membership check as every menu write without a second mechanism. A replace swaps the whole week and every special date in one transaction. Special dates live in `merchant_special_dates` (a date with no ranges closes the day) with ranges in `merchant_special_hours`. The cost is that an hours save and a menu save from two tabs conflict on revision; the client re-reads and retries, which is acceptable for one restaurant's small team. The "closed now" override is a separate sub-task.

The weekly and Ramadan editors load separate snapshots. After a successful sibling command, advance another draft only if it has the same session and the revision that command submitted. An older draft keeps its original revision so the server can reject it and require reload. The preview can refresh at the newer revision independently of the draft.

### D-012 — "Closed now" is the M1 `pausedUntil` (2026-11-08)

MER-15's "closed now" override is stored as the nullable `merchants.hours_paused_until`, the instant the M1 `isOpenAt` rule already reads as `pausedUntil`. Owners and managers set it via the `hours_pause` command on the D-011 menu guard. The instant must be strictly after the server clock, or the command returns `pause_not_in_future`. Passing null reopens the restaurant on its regular hours. An end instant is always required, so a restaurant cannot stay closed indefinitely by forgetting a toggle. Indefinite closure is the merchant `paused` status, which admins and billing own.


### D-013 — Geo tests read the contract's method list (2026-11-08)

`@zaafran/geo` takes `@zaafran/contracts` as a dev dependency only, so `maghrib-methods.test.ts` can prove that every method `merchantRamadanInput` accepts yields a Maghrib time from `calculateMaghrib`. Its runtime code still does not import contracts. The seven-day preview is computed in the API: `apps/api` gains `@zaafran/geo` (Maghrib per day at the merchant's stored location) and `@zaafran/domain` (the pure M1 hours and Ramadan rules), keeping astronomy out of the browser bundle and the clock on the server.

### D-014 — Prohibited-goods screening and item review receipts (2026-11-08)

SPEC §17.3 screening is the pure `findProhibitedGoods` in `@zaafran/domain/moderation`, called by the item create/update commands in `packages/db`. That puts the held status in the same transaction as the write, as `menu-price.ts` already does with domain rules. Admin decisions (ADM-04) use their own `item_review_receipts` table, keyed by admin and idempotency key, rather than widening `merchant_command_receipts`, whose rows describe a merchant, not an item. A decision moves an item only from `blocked_pending_review` to `approved` or `rejected`, writes `audit_log` (`item_approved`/`item_rejected`), and increments `menu_revision`, because a listing change is a menu change for ETags and open editors.

### D-015 — Staff invitations are phone-bound, single-use SMS tokens (2026-11-08)

MER-23 invitations live in `@zaafran/contracts/merchant-staff`. Only an owner creates, lists or revokes them (managers get "everything except billing and staff"). An invitation grants `manager` or `staff` only, because owners come from MER-01 signup. The server creates a random 32-byte Base64url token, stores only its SHA-256, and sends it in the SMS link through the SMS adapter after the commit, as the OTP flow does. A replayed create (matched by the idempotency key stored on the invitation row) rotates the token hash and resends while the invitation is still open, so a retry after a lost or failed SMS delivers a working link and the earlier one stops working. A closed or expired invitation replays without an SMS. The create response never returns it. The invitee redeems it at `POST /v1/staff-invitations/accept` while signed in with the invited phone. In one transaction, acceptance checks the phone, the expiry (7 days) and that the invitation is unconsumed and unrevoked, consumes it, and inserts the `merchant_members` row. A second accept, another account's phone, an expired or revoked token, or an existing membership is rejected.
- **Alternatives:** an invite code the inviter reads out (rejected: it leaks into the inviter's screen and logs); auto-joining whoever signs in with the phone (rejected: a reassigned number would silently gain access).
- **Web:** the SMS link is `/{locale}/staff/accept#token=…`. The page clears the fragment on load. When the invitee is signed out, it keeps the token in `sessionStorage` only until the sign-in round trip (`continue=staff-accept`) ends in a terminal answer, so the token never reaches a server log or another tab's history.
- **Consequences:** a lost SMS means the owner revokes and re-invites; the M5 courier invitation (MER-08/COU-01) can reuse the same table with a `courier` role later.

### D-016 — Menu import validates raw cells on the server (2026-11-08)

CSV and XLSX use the same template and send up to 500 rows of raw text cells within the API body limit. Preserve interior blank rows so errors use the original spreadsheet row numbers. Only a valid preview returns a token. Bind the token to the merchant, account, session, menu revision and canonical validated rows. Apply must verify the token and revalidate inside the owner/manager write path. Merchant-scoped external item keys prevent duplicates on repeated imports. Imported text must pass the same prohibited-goods screening as other menu edits.

### D-017 — Load bounded spreadsheet parsers on demand (2026-11-08)

Use `read-excel-file` 9.3.14 for XLSX and `csv-parse` 7.0.3 for CSV. Load both only from the import flow. Preserve raw numeric strings, whitespace and interior blank rows. Before XLSX parsing, use `@zip.js/zip.js` 2.24.0 with strict archive and CRC checks, and `saxen` 11.2.0 for bounded XML inspection. Reject formulas, macros, external relationships, DTDs and entities. Bound the compressed file to 1 MiB, archive entries to 32 and total inflated bytes to 8 MiB. The row, column, field and API body limits also apply. These choices follow verified synthetic workbook, malformed archive and decompression probes. [XLSX reader](https://github.com/catamphetamine/read-excel-file) · [ZIP parser](https://github.com/gildas-lormeau/zip.js) · [CSV parser](https://csv.js.org/parse/options/) · [XML parser](https://github.com/nikku/saxen)

### D-018 — Rollout order for persisted photo preparation (2026-11-08)

Apply migration 0019 before starting the updated API. Replace every API instance before enabling the updated worker. The older API can read pending rows after the migration, but its responses omit preview dimensions and rejection reasons on the new states. For rollback, stop the prepare worker and keep the compatible API serving existing rows. Revert to the older API only with a compatible data restore or a backport of the new response projection.

The worker checks the adopted byte count and digest before decoding. It writes the preview to a private, content-addressed key before atomically advancing the upload. Retrying with the same output reuses the object. If competing encoders produce different bytes, the losing object stays private and needs a future orphan sweep. Keep the quarantined original available for crop and remove it only after a durable rejection or completed publication.

### D-019 — Original-session crop and atomic variant publication (2026-11-08)

Record the session when a reservation is first created. A crop requires that session to still be live and the owner to retain access to the restaurant. Reservations created before migration 0020 have no trustworthy session provenance. An owner who needs to crop a legacy reservation or resume under a replacement session must create a reservation with a fresh idempotency key and re-upload. A reserve replay returns its original media ID without changing provenance.

Store crop settings and enqueue the crop job in the same transaction. The worker encodes the quarantined original and stores each variant under a private, content-addressed key. Publish the complete set in one state change. Only then remove the original and preview. The ready status exposes dimensions, sizes and ThumbHash. Fetch variant bytes through the authenticated owner route. Public menu serving belongs with item attachment and listing.

For rollout, apply migration 0020 and replace every media worker with a crop-capable build before exposing the new API. Pause uploads during the API switch so old instances cannot create sessionless reservations. Once ready rows exist, keep a compatible API during rollback, since earlier builds cannot serialize ready metadata.

### D-020 — Photo attachment and explicit removal (2026-11-08)

Store application photo IDs in submission order in the same transaction as the application. The upload owner retains private read access. Attach item photos only when a ready upload belongs to the acting editor and the target restaurant. The restaurant's other owners and managers may read ready variants while a live item references the photo. Raw upload and crop access stay with the uploader.

A menu item edit with `photoId: null` keeps the saved photo so cached editors can still edit text or price safely. Removing a saved photo requires `removePhoto: true` with a null photo ID. A non-null replacement keeps the existing ownership and readiness checks. Apply migration 0021 before rolling out the attachment API and editor.

### D-021 — In-app merchant application notices (2026-11-08)

Deliver MER-01 notices inside the authenticated admin console. Signup already records one notice per application in the same transaction as the merchant, owner membership and replay receipt. A separate uncached admin read returns the pending count and most recent merchant ID from these notices. The existing review queue keeps its response shape and remains the way to open a case. An approval or rejection removes the application from the pending count in the same committed state change. Keep the notice row for provenance. The admin UI belongs to Lane B.

### D-022 — Merchant preview reads the saved menu draft (2026-11-08)

Give authorized owners and managers a customer-style preview of the saved menu for approved, active and paused restaurants. Bind the category page and item detail to the authenticated session and menu revision. The read projection contains display fields and ready item photo IDs. Apply moderation and archival filters before emitting an item or its options. Anonymous publication, customer links and public photo delivery belong to M3.

### D-023 — Moderation binds to the reviewed text and cycle (2026-11-08)

Freeze names and descriptions while an item awaits review in both direct edits and spreadsheet imports. Price, category and other non-text edits remain available. The opt-in held queue includes a review token computed from the canonical text, item ID and count of prior committed reviews. A later hold requires its current token, and any supplied token must match under the merchant lock. Exact retries return the original receipt. The legacy queue can complete first holds during the Lane B UI rollout. Refresh held queues during deployment so first-hold reviewers see the current text.

### D-024 — Attach restaurant cover and logo under the menu revision (2026-11-08)

Save both profile photo slots with one session-bound menu command. Owners and managers can retain a ready attachment. New selections must be ready uploads of the correct kind, owned by the editor and scoped to the restaurant. Null removes the corresponding slot. Other eligible editors can read ready variants while the photo is attached. Upload and crop stay scoped to the uploader.

### D-025 — Keep discovery coordinates in the request body (2026-11-08)

This supersedes the GET method for serviceability in SPEC §13. Use a public POST with a strict point
or commune body and a no-store response. Exact coordinates stay out of URLs and their access logs.
The lookup makes no writes. Geographic coverage does not imply that ordering is enabled.

### D-026 — Public feed and profile photos share publication rules (2026-11-08)

The initial feed uses merchant ID keyset pagination over active, non-demo restaurants. Saved
weekly hours, exceptions and temporary pauses determine the displayed open state. Public profile
photos resolve only a current, ready, same-merchant cover or logo. Every photo read rechecks
publication and attachment and sends no-store. Storage keys stay server-side. Global open-first
ordering and the geographic and commercial fields need their own data and cursor work.

### D-B01 — Lane B mocks unbuilt APIs with MSW (2026-11-08)

`msw` 3.0.3 (MIT, exact pin; 3.0.4 is younger than `min-release-age=3`) is a web devDependency. Handlers live in `apps/web/test/mocks/` and parse every payload with the published `packages/contracts` schemas, so mocks cannot drift from the contract. Production code never imports `msw`. Lane B ids use the `D-B` prefix to avoid number clashes with lane A.

### D-B02 — QR codes with qrcode-generator (2026-11-08)

MER-24 posters need QR codes. `qrcode-generator` 2.0.4 (MIT, no dependencies, published 2025) encodes the modules; lane B draws them as one SVG path, so nothing is rasterised. Writing Reed–Solomon by hand was not worth the risk.

### D-B03 — three.js and React Three Fiber for the landing hero (2026-11-08)

DESIGN §8 asks for React Three Fiber. `three` 0.187.0 and `@react-three/fiber` 9.8.2 (MIT, exact pins, both older than the 3-day release age) load only in a lazy chunk after LCP on capable devices; everyone else keeps the server-rendered SVG poster. The hero's colours are DESIGN §3.1/§3.4 constants in `apps/web/src/marketing/hero-palette.ts` because the illustration must not invert in dark theme.

### D-B04 — Customer app on Expo SDK 58 with Jest in verify (2026-11-08)

`apps/mobile` uses Expo SDK 58.0.23 with the exact versions from Expo's `bundledNativeModules.json` (React 19.3.0, React Native 0.88.1, Expo Router, Reanimated 4.7.1). Tests use jest-expo + React Native Testing Library 14 (async `render`, `userEvent`); root Vitest already excludes mobile, so `pnpm verify` gains `pnpm test:mobile`. `packages/ui-native` builds its theme from `@zaafran/tokens` `palettes.json`/`metrics.json`, newly exported for this. `expo-updates` is ignored in knip until M10-6 adds EAS Update.

### D-027 — Separate marketing from customer discovery (2026-11-08)

Keep the Casbah marketing landing at the locale root. Its primary action opens the anonymous
customer home at the localized `/discover` path. The address picker and feed stay together on
that page, and locale switching and alternate metadata retain the discovery path.

### D-028 — Keep route estimates separate from cash quotes (2026-11-11)

Active buyer tracking sends a fresh courier fix and the destination to self-hosted OSRM. The API accepts loopback and Compose routing origins. It coalesces estimates for the same order for 30 seconds. A route failure uses great-circle distance × 1.35 at 24 km/h, with a 60-second breaker after three failures. The fallback provides an ETA without drawing a road line. Expired GPS fixes do not generate a new ETA. Quote totals, zone fees and accepted order prices remain independent of router availability. [OSRM route service](https://project-osrm.org/docs/v26.6.1/http.html)

## D-029 · Use built-in Arabic map shaping

Pinned MapLibre GL JS 6.16.0 shapes Arabic and reorders bidirectional text in its worker. Keep the worker and Noto Sans glyph ranges on the same origin and use Protomaps 5.7.2 for the geometry layers. This replaces the external RTL plugin for the web implementation of GEO-05. [MapLibre RTL API](https://maplibre.org/maplibre-gl-js/docs/API/functions/setRTLTextPlugin/) · [Protomaps assets](https://docs.protomaps.com/basemaps/maplibre)

## D-030 · Encrypt nightly backups with age

Use the exact age 1.3.2 release for streaming authenticated encryption. The backup server holds the recipient only. The recovery host holds the identity. Linux amd64 release SHA-256 is `cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10`. [Official release](https://github.com/FiloSottile/age/releases/tag/v1.3.2)

### D-B05 — AWID design system supersedes "Casbah Saffron" (2026-11-11)

Supersedes the colour, type, logo and motion sections of the earlier DESIGN. Per docs/SPRINT.md the brand is AWID: deep green #0B3D2E for text and primary actions, #00A37A for large shapes and accents, mint #4DE3B4, pale mint #D9FCE7 and cream #FFF8E6; Poppins with IBM Plex Sans Arabic, self-hosted; radii 20/28 px with green-tinted shadows instead of borders; motion 150/250/400 ms on cubic-bezier(0.2, 0.8, 0.2, 1) with a 0.97 press. The logo and app icon are SVGs traced from docs/brand/awid-reference.jpg with dark variants. Fraunces, Inter and Noto Naskh were removed.

### D-B06 — Remove the 3D Casbah hero; photography leads the landing (2026-11-11)

Supersedes D-B03. SPRINT allows one 3D scene only if it is excellent after a bounded effort. The procedural Casbah hero read as crude boxes in the old saffron palette, so the landing now opens on credited Algeria photography with a slow zoom and crossfade (CSS only, off under reduced motion). `three`, `@react-three/fiber` and `@types/three` are removed from `apps/web`. Attribution for every photo is shown at `/[locale]/credits`.
