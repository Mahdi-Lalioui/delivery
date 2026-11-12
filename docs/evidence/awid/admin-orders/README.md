# Admin live orders

The first browser pass found a weak page heading, crowded mobile filters, grid tracks that overflowed in both directions, insufficient separation between results and the selected order, and an ambiguous intervention form. The next pass strengthened the heading, stacked filters on phones, constrained grid tracks, introduced a selected-order summary and made the intervention explicit.

The final production-build screenshots cover Arabic at 390 px in light and dark, French at 390 px in light, and French at 1280 px in dark. The browser test checks axe and horizontal overflow, sees a new order arrive, then verifies that a forced cancellation leaves an audit reason. The screenshots use the Lane A shell before integration with the AWID design system.

## AWID design pass, 2026-11-12

The first AWID build used one muted badge for all stages, made rejections look like active orders, had a low-emphasis selected ticket, left event rows without a reading anchor, and gave the force form little separation. The second pass distinguishes pending, accepted, finished and failed stages, strengthens selection, adds timeline markers and groups the force form on its own surface.

The final captures use the AWID shell in Arabic 390 px light and dark, French 390 px light, and French 1280 px light and dark. Axe and overflow checks passed for each. The admin action and audit reason were verified against the production API and PostGIS.
