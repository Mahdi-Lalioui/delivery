# Photo attachment review

- [x] **P1 — An authorized editor could retain another editor's photo but could not preview it.** Ready status and variants now follow the same restaurant's live item attachment for owners and managers. PostGIS tests deny unrelated merchants, staff, unattached photos, raw uploads, crop mutations, and photos whose last item was archived or replaced.
- [x] **P1 — A cached menu editor could clear a saved photo during a text edit.** A legacy null retains the existing photo. Explicit removal requires `removePhoto: true` with a null ID. Contract, HTTP, PostGIS and production browser tests cover validation, preservation and removal.
