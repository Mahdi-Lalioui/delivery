# Lane B backend slice review

- [x] **P1 — Overlapping invoice periods could charge for the same days twice.** Invoice issuance
  rejects overlapping non-void periods under the subscription lock before assigning a number.
  A PostGIS test reproduced the duplicate charge, then verified rejection, adjacent-period
  issuance, and a contiguous invoice sequence.
- [x] **P1 — Platform replay could fail for a second spelling of the same admin UUID.** Receipt
  locking, lookup and insertion now use the canonical actor ID. A PostGIS regression held the
  flag table lock to prove mixed-case concurrent requests share the advisory lock and replay.
- The reviewed billing slice assumes a provisioned subscription. The subscription activation and
  payment reactivation lifecycle remains open for BIL-02. See the
  [backend handoff](../requests/lane-a-backend-batch.md).
