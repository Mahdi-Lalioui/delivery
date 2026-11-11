# Public restaurant and cart review

- [x] **P1 — Category serving windows do not affect public item availability.** Apply the
  category's Algiers civil-time window, including overnight intervals, in both list and detail.
  Retain item sold-out checks and prove boundaries plus rejection when configuring the cart.

- [x] **P0 — Option names bypass prohibited-goods screening.** A benign item can attach a
  prohibited option. Withhold affected public items across list/detail/photo reads after
  screening attached group and option names, and add real PostGIS regressions. Required option
  groups must never be silently removed while leaving the base item purchasable.

- [x] **P1 — An open menu can get stuck on an obsolete revision.** Category results must
  pass their revision to item details. Refresh the menu after a revision conflict in item
  details or pagination so subsequent requests use current data.

- [x] **P1 — Restaurant and item screenshot hierarchy.** Keep the first dish visible on
  desktop, use a named placeholder for the cover, and capture the item from the top
  without clipping it behind the sheet title. Recapture from the current localized build.

- [x] **P1 — An old cart expiry timer can erase a renewal from another tab.** Re-read
  current storage at expiry before clearing. The production browser regression checks
  preservation before a storage event, cleanup at the new deadline, and blocked storage.
