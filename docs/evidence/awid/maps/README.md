# Maps on real Algeria tiles (lane B, 2026-11-12)

Production preview build (`next build`, `ZAAFRAN_PREVIEW_DEMO=1`) served by `next start`, tiles
proxied to Martin on the pinned national extract (`infra/data/maps/algeria.pmtiles`, SHA-256
`286c47ac…54a91` checked by `infra/scripts/prepare-algeria-maps.sh`, go-pmtiles 1.31.2 checked
against GitHub's published digest `40528f7f…880f3d`).

Captured with `pnpm evidence:maps http://127.0.0.1:3110 docs/evidence/awid/maps`.
Every run: every tile request returned 200 with vector data, zero console errors, at
ar-390, fr-390, fr-1280 and fr-390-dark, for both screens.

- `pickup-*.png`: AWID-token basemap; labels in the page language (Arabic on Arabic, French on
  French, falling back to the local OSM name, never English); pins are cards (logo or initial,
  name, rating, wait) with a tail on the exact spot; pins whose cards would overlap merge into a
  count that zooms in when pressed.
- `tracking-*.png`: pitched map with real streets, extruded buildings, the route and the rider;
  Arabic street names on the Arabic screen. When streets fail to draw, the designed map stays and
  a notice card inside the map says so and offers "Réessayer" (no longer a stray link).
