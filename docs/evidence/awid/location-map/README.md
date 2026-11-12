# Location map

Run `pnpm exec playwright test --config e2e/maps.config.ts` against the production build configured in [MAPS.md](../../../../infra/MAPS.md). Chromium used local Martin, the national archive and the real PostGIS serviceability API.

Round one showed a zero-height map container, excess vertical space on a phone, controls that needed a stronger touch target, a location crosshair competing with the accuracy circle and attribution separated from the confirmation affordance. The final capture uses an explicitly sized canvas, a shorter responsive frame, 44 px zoom controls, a centred marker with a contrasting ring and one compact row beneath the map.

The surrounding discovery shell uses the Lane A theme pending the integration of Lane B's AWID tokens.
