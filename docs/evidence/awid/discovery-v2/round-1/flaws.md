# Discovery (new brief) — round 1 flaws

New in this round: full sort-and-filter sheet, filters in the URL, removable active chips,
"clear all", and a "widen your search" empty state. Compared with Deliveroo, Uber Eats and Wolt.

1. **Data honesty.** The preview catalog ignores `priceLevel` and the pay-at-door filters, so the
   empty-results capture still returned a restaurant; the preview must honour every contract
   filter and its restaurants need price levels and payment options.
2. **Switch contrast.** Off-state switches are a pale mint track with a white knob; they barely
   read as controls.
3. **Rhythm.** The four sort pills wrap and leave "Delivery time" alone on a second line; an even
   2 × 2 grid reads calmer.
4. **Clear all.** "Clear all" looks like a plain link and stays active with nothing to clear.
5. **Result count.** The apply button cannot say "Show 6 restaurants" yet: no `totalCount` in
   the feed (requested in docs/requests/lane-b-discovery-feed.md).
