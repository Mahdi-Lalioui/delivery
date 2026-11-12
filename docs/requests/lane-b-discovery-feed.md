# Lane B → lane A: discovery feed fields for the new brief

Status: all requested feed data implemented except offers (2026-11-12).

The new lane B brief asks for discovery features that have no data in the published feed
contract on `main`. Lane B ships none of them until the data exists ("never ship a filter or
badge that has no real data behind it"). Already built on existing fields: sort (recommended,
distance, rating, delivery time), open now, free delivery, max delivery time, price level,
rating 4+, Baridi Pay and card terminal, rating with count, delivery time range, fee, logo.

Requested additions to `publicFeedQuery` / `publicRestaurantCard`:

1. **Fulfilment.** `fulfilment=delivery|pickup` filter and `offersPickup: boolean` on cards, for
   the Delivery / Pickup toggle and the pickup map (cards also need the restaurant `pin`).
2. **Scheduling.** `availableAt` (ISO instant) so "Schedule" shows restaurants open at that time.
3. **Distance.** `distanceMeters` on cards, relative to the saved delivery location.
4. **Offers.** `offer` on cards (label key and value) and an `offers=true` filter, once promotion
   redemption is in scope.
5. **Dietary.** `dietary` tags on cards and a `dietary` filter (vegetarian at least; menu items
   already carry the tag).
6. **Sort by fee.** `sort=fee`.
7. **Result count.** `totalCount` in `publicFeedOutput` for "Show N restaurants".
8. **Rails.** `isNew` (opened within 30 days) for the "New" rail, and a `maxMinimumOrderDzd` or
   cheapest-dish field for "Under 1 000 DA".

Lane B will add each control as soon as its field lands, with tests named after the SPEC IDs.


## First API delivery

The contract and backend now support `sort=fee` on `GET /v1/feed`. It uses the matching
delivery zone for the selected commune, puts free delivery first and unknown fees last,
and paginates ties by restaurant ID. The local preview catalog honors fee order too.

`distanceMeters` is an optional, rounded straight-line distance from the selected commune's
centroid to the restaurant. It is omitted without a usable commune. The public feed continues
to accept a commune ID only. The current screen saves the location separately from the feed,
so the UI should pass the selected commune ID on list and rail requests, reset pagination
when it changes, and label the distance as approximate.

## Customer screen

Both lanes built location-aware Discovery. The integrated restaurant list and curated rails use the saved commune ID and restart when it changes.
The filter sheet exposes lowest delivery fee and persists the choice in the URL. Restaurant
cards label the centroid distance as approximate. A closest-first rail appears when a commune
is selected. [Design and browser evidence](../evidence/awid/discovery-v2/README.md)

## Pickup, scheduling and dietary API handoff

- `fulfilment=pickup` lists public restaurants that enabled pickup. Use the card’s
  `pin.latitude` and `pin.longitude` for the pickup map and `offersPickup === true`
  to show the pickup option. In pickup mode the minimum is the pickup minimum.
  Delivery fees and delivery ETAs are absent.
- `fulfilment=delivery` requires an active delivery zone. Supply the selected
  `communeId` to filter by its centroid. The exact pin is checked when quoting.
- `availableAt=<UTC ISO instant>` filters by opening hours at that instant, including
  overnight hours, exceptions and pauses. The API accepts a future instant up to
  three days out. `isOpen` still reports current status. The quote validates prep,
  delivery travel and actual slot availability.
- `dietary=vegetarian` requires a public, orderable dish tagged vegetarian. Cards
  expose `dietary: ["vegetarian"]` where applicable. With `availableAt` set, the dish’s
  availability is evaluated at that time.

## Count and rails API handoff

- `includeCount=true` adds `totalCount` across all pages of the same filters. The
  count ignores the cursor and page size. Request it when the filter sheet needs
  a result count.
- `newOnly=true` limits results to restaurants first published on AWID in the last
  30 days. This rail response marks its cards with `isNew: true`. Publication is recorded
  going forward and reopening does not reset it. Older publication dates are unknown.
- `maxMinimumOrderDzd=999` supports a minimum-order rail under 1,000 DA. The value
  applies to pickup or the delivery zone for the chosen commune. Label the rail
  by its minimum order. The threshold is inclusive.

These filters use the connected API. The standalone preview catalog needs fixture support
before the new controls are used there. Offers are pending promotion redemption at checkout,
which is outside the current sprint.

## Lane B follow-up 2 (2026-11-12)

Shipped on `lane-b`: a vegetarian switch in the filter sheet (`dietary=vegetarian`, kept in the
URL); a live "Show N restaurants" count on the sheet button (`includeCount=true&limit=1`, with
the saved commune); "New on AWID" (`newOnly`) and "Order from 1 000 DA or less"
(`maxMinimumOrderDzd=1000`) rails; and a "New" badge on cards with `isNew`. The preview catalog
honours these fields with fictional values. Pickup toggle, pickup map and scheduling are next.
