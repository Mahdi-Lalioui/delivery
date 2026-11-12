# Algeria map data

The national archive covers longitude −8.69 to 12.01 and latitude 18.95 to 37.15 through zoom 15. The pinned extract is approximately 1.1 GB. Its SHA-256 is `286c47ac20ac77ab0b5d72fdfe8eedbb97edff5e83a38938588562fbd3f54a91`. [Protomaps source build](https://build.protomaps.com/)

The road graph uses the dated Geofabrik Algeria extract and the repository’s pinned OSRM image. Both input files are checked before publication. The road graph is built in a temporary directory and moved into place only after all three OSRM phases succeed. [Geofabrik Algeria](https://download.geofabrik.de/africa/algeria.html) · [OpenStreetMap attribution and licence](https://www.openstreetmap.org/copyright)

Install the exact go-pmtiles release from D-001. Run from the repository root.

```sh
bash infra/scripts/prepare-algeria-maps.sh /path/to/pmtiles
docker compose -f compose.yml -f infra/compose.maps.yml up -d --wait martin osrm
```

The overlay reads `infra/data/maps` by default. Set `ZAAFRAN_MAP_DATA_DIR` to reuse a separately prepared directory. Martin publishes TileJSON at `http://127.0.0.1:3001/algeria`. Set `OSRM_INTERNAL_ORIGIN=http://127.0.0.1:5000` for the local API, or `http://osrm:5000` in the same Compose network. The normal development Compose still uses the small offline fixtures.

## Web map

For a local production build, run `ZAAFRAN_TILE_ORIGIN=http://127.0.0.1:3001 pnpm --filter @zaafran/web build` after starting the national overlay. The browser uses only the application origin. The hosted app derives its tile upstream from `ZAAFRAN_API_ORIGIN` and expects the backend to expose `/tiles/algeria/{z}/{x}/{y}`.

Run `pnpm exec playwright test --config e2e/maps.config.ts` against that build and the PostGIS test database. This suite requires the national archive and checks Arabic and French pin selection, tile and glyph responses, canvas sizing and console errors.

MapLibre GL JS uses its built-in Arabic shaping, and map labels use the checked-in Noto Sans glyph ranges. The glyphs and OFL licence come from the [pinned Protomaps asset revision](https://github.com/protomaps/basemaps-assets/tree/028c18f713baecad011301ff7a69acc39bcc2ae7/fonts).
