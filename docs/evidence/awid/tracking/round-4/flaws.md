# Tracking — round 4 (3D map)

Captured on the dev server with the preview demo (no national tiles locally).

- The 3D scooter mounts a few seconds after the map in dev (three.js compiles on first use); until then the flat rider marker shows, so the courier is never missing. `fr-390-light-3d-scooter.png` is the settled state.
- Checked separately on real Algiers vector tiles with 3D buildings: at street zoom the first scooter was ~10 px, now a constant ~46 px; the route glow was too faint, now mint at 0.85.
- Remaining: confirm on the preview deployment with the AWID basemap tiles.
