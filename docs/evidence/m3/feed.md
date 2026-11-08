# M3-2 anonymous restaurant feed

The home shows active restaurants with current cover and logo variants, localized cuisine labels,
regular Algiers hours and a next opening when available. It has loading, empty, error and
pagination states. The card crop is 4:3 and uses existing AVIF and WebP image variants.

The API rejects precise coordinates on the GET query. It pages by merchant UUID using the
partial publication index. Photo requests recheck merchant and attachment scope and send no-store.
PostGIS tests cover visibility, dated hours, overnight spill, temporary pauses, variant scope,
replacement, detachment, and an opening outside the public timestamp format.

Arabic and French production Playwright journeys exercise anonymous browsing, pagination,
an actual cover through the public variant route, and a hidden merchant. The [capture matrix](feed/)
uses 390px and 1280px viewports in light and dark themes.

`pnpm verify` passed 1,568 unit and 222 PostGIS tests, and authorization passed 224.
Both production browser cases passed. The design critic approved all eight final captures.

Global open-first ordering, seasonal hours, location ranking, ratings, delivery pricing and ETA,
and opening the restaurant page remain open.
