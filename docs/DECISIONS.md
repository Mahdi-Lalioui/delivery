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
