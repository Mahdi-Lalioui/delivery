# Tracking design loop

Captured on the real full-page route `/[locale]/dev/screens/tracking` (and `-pickup`,
`-waiting`), not the gallery. `round-1/`, `round-2/`, `round-3/` each hold ar 390, fr 390,
fr 1280 and ar 390 dark with `flaws.md`; `final/` is the state after round 3 (on the way,
`pickup/`, `waiting/`).

## Empty basemap fallback (2026-11-12)

Mahdi saw an empty blue map: the style loads while tiles are missing, empty (Martin answers
204) or the local synthetic placeholder, so MapLibre reports "loaded" with only water colour.
`basemap-check.ts` now waits for the map to settle and keeps the designed AWID zellige map
until roads or buildings are actually drawn; failures and empty tiles keep it and offer Retry.
`fallback-no-streets-fr-390.jpg`: the dev server pointed at the local placeholder tile server.
Real national tiles on a production build are still to be proven (needs the ~1.1 GB extract).
