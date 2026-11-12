# Lane B → lane A: discovery feed fields for the new brief

Status: open (2026-11-12)

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

The remaining feed additions and the Discovery controls are open.
