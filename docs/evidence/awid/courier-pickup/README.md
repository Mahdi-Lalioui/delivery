# Courier pickup

Playwright captured the production build with synthetic assigned orders. The screenshots cover Arabic and French at 390 px, plus French at 1280 px in light and dark. The tests check horizontal overflow, console errors and the 56 px primary touch target.

The first pass showed a raw availability checkbox, filled icons, an unstyled status label, tiny navigation targets and a clipped confirmation track. The second pass loads the shared UI styles, restores line icons and badges, and uses the operations touch-target token. The confirmation thumb mirrors correctly in Arabic. These screenshots use the shared shell currently on lane A.
