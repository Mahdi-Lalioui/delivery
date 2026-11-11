# Public feed review

- [x] **P0 — A valid merchant pause could break the public page.** An opening after the year 9999
  falls outside the public timestamp format. The feed now returns a null opening time for that
  card while keeping it visible as closed. A real PostGIS regression reproduced the invalid
  response before the fix and passed afterward.
