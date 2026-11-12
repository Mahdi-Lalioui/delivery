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

The courier pass checked owner invitation, assigning a ready ticket and opening a private proof photo. The second visual pass uses a compact delivery-team disclosure with a mirrored chevron, an assignment status badge, and separate desktop roster and invite columns. The four screenshots show the updated board.

## AWID design pass, 2026-11-12

The first AWID build buried the Ready and Preparing stages below the first ticket on mobile, gave no counts above the fold, made new tickets blend into ready work, treated the sound action as an unlabeled colour dot, and gave the cash due and change equal emphasis. The second pass adds mobile stage links with counts, a harissa edge for new tickets, a labelled bell with a checked state, and a grouped cash amount with stronger type. The French desktop keeps the three columns in view.

Final captures cover Arabic 390 px light and dark, French 390 px light, and French 1280 px light and dark. Playwright checks horizontal overflow, console errors and axe in each variant.
