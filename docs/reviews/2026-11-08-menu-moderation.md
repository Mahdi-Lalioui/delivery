# Menu moderation review

- [x] **P1 — Admin review and merchant edits acquire menu locks in opposite orders.** Admin review now locks the merchant first and rechecks the item before updating it. The PostGIS regression reproduced the deadlock before the fix, then verified both commits, two revision increments and one audit entry after replay.

- [x] **P1 — Bulk undo accepts an intervening price change that returns to the applied amount.** Each actual price change increments a database-maintained version. Apply records it and undo compares both price and version. The PostGIS regression reproduced the incorrect undo before the fix and passed afterward. Same-price edits preserve undo eligibility. Legacy history without a recorded version is rejected safely.
