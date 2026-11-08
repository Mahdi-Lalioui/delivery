# Hours editor revision review

- [x] **P1 — A sibling save can advance a stale draft past a concurrent write.** Weekly hours and Ramadan load independently. If they load different revisions, a save in the newer form must leave the older draft on its original revision. The production regression reproduced HTTP 200 where the server should reject the older full replacement with HTTP 409. After the fix, it returned 409, focused Reload and preserved the other tab’s date in PostGIS. The reducers also reject cross-session revision updates.
- [x] **P2 — Positive-year validation changed the published date format.** The special-date schema retains OpenAPI `format: date` and rejects year zero without narrowing the remaining Gregorian dates.
