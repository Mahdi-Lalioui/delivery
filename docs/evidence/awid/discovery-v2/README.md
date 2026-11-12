# Discovery (new brief) design loop

Filter sheet, URL filters, active chips and the widen-search empty state. `round-1..3/` hold the feed, the open sheet (`sheet/`) and the empty result (`empty/`) at ar 390, fr 390, fr 1280 and ar 390 dark, each with `flaws.md`. The outstanding backend fields and controls are tracked in [Lane B’s feed request](../../../requests/lane-b-discovery-feed.md).

## Commune-based Discovery

The gallery links to `/[locale]/discover`. The captures use the existing fictional team-preview restaurants and synthetic distances. The production browser test checks the commune and fee-sort requests against PostGIS.

The first review found a weak headline, filters below the curated rows, uneven sort controls, unsupported payment switches, and a saved-location name that voice controls could not match to the visible French text. The updated design gives the headline more space, keeps filters in reach, makes the sort choices consistent, removes unsupported switches, and includes the visible address in the button name. Food collections have directional cues and subtle zoom on pointer hover with reduced-motion support.

The final captures passed overflow, photo loading and browser-console checks. Axe reported zero violations on both the page and filter sheet in all five variants.

| Arabic mobile | French mobile | French desktop |
| --- | --- | --- |
| [Light](commune-feed/ar-390-light.png), [dark](commune-feed/ar-390-dark.png), [filters](commune-feed/ar-390-dark-filters.png) | [Light](commune-feed/fr-390-light.png), [nearby cards](commune-feed/fr-390-light-rail.png) | [Light](commune-feed/fr-1280-light.png), [dark](commune-feed/fr-1280-dark.png), [filters](commune-feed/fr-1280-light-filters.png) |
