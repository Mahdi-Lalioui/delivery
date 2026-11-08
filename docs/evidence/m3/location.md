# M3-1 location slice

The localized home can resolve an anonymous GPS fix or an Algiers commune, show whether the
location is covered and keep the confirmed selection in this browser. The read-only API keeps
exact coordinates in the request body and sends no-store on success and error responses.

The launch seed uses the official boundary union for communes `1601`–`1632` and preserves
edits on reseed. The PostGIS checks cover a known location, an exact boundary vertex, inactive
coverage, an uncovered commune, an unknown commune, and a centroid outside its own boundary.

Production Playwright exercises Arabic and French commune selection, reload persistence, stale
selection reset on search edits, and the GPS flow from an imprecise fix to a location outside
coverage. The screenshot matrix under [location](location/) uses 390 × 844 and 1280 × 800,
Arabic and French, and both color schemes with reduced motion.

`pnpm verify` passed 1,553 unit and 216 PostGIS cases. `pnpm test:authz` passed 222 cases.
The geospatial reviewer passed the final API. The design critic approved all eight screenshots.

The fixed-centre street map, GPS accuracy circle and pin refinement, outside-area opt-in,
and audited polygon editor remain open. The home still supports browsing from outside the area.
