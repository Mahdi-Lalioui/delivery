# Merchant order board

Production Chromium captures with synthetic tickets. Arabic and French at 390 px,
plus French at 1280 px in light and dark.

The first review found an oversized marketing heading, extra copy before the
tickets, an empty column that stretched to the longest column, prep chips narrower
than 44 px, a small countdown, and destructive disclosures without expansion
affordances. The next build compacted the header, replaced the stretched empty
column with a short panel, enlarged the controls and countdown, and added
disclosure chevrons. A final check kept the French mobile heading on one line.

The captures use the shared theme currently on lane-a. AWID's brand changes land
through the shared design system.

The same browser suite checks acceptance, offline action locking, resuming with
the last cursor, no console errors in the four layout captures, and no horizontal
overflow.
