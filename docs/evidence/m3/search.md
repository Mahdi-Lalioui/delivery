# Search implementation evidence

Full verification passed 1,579 unit and 234 PostGIS tests. Both Arabic and French production
journeys passed, including Graphile index refresh, grouped results, recent history persistence
and clearing. Independent backend review closed the database work-bound finding. The design
critic passed the eight captures in search/. Full-page captures include background content
below the fixed search viewport.

The index supports normalized text, phonetic skeleton, prefixes and trigram matches, with
live publication and moderation checks. Refreshes are marked transactionally and processed
by the worker. Public searches require at least two normalized letters or digits to query the
database and have a local 500ms statement timeout.

Complete geographic, opening, rating and order-volume ranking, the full golden suite and the
500-restaurant/30,000-item performance benchmark remain open.
