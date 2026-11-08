# Menu moderation review

- [x] **P1 — Admin review and merchant edits acquire menu locks in opposite orders.** Admin review now locks the merchant first and rechecks the item before updating it. The PostGIS regression reproduced the deadlock before the fix, then verified both commits, two revision increments and one audit entry after replay.

- [ ] **P1 — Bulk undo accepts an intervening price change that returns to the applied amount.** Compare each item's price version with the version recorded at apply, so a later edit cannot be undone accidentally. Prove the old → new → old sequence.
