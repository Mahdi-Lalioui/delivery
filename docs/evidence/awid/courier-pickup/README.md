# Courier pickup

Playwright captured the production build with synthetic assigned orders. The screenshots cover Arabic and French at 390 px, plus French at 1280 px in light and dark. The tests check horizontal overflow, console errors and the 56 px primary touch target.

The first pass showed a raw availability checkbox, filled icons, an unstyled status label, tiny navigation targets and a clipped confirmation track. The second pass loads the shared UI styles, restores line icons and badges, and uses the operations touch-target token. The confirmation thumb mirrors correctly in Arabic. These screenshots use the shared shell currently on lane A.

## AWID design pass, 2026-11-12

The first AWID build left the job code and state floating between panels, gave offline and online presence the same surface, placed the call and map controls too close, made routing links look detached, and gave cash due too little hierarchy. The second pass groups the job code and badge, uses the success surface for live presence, groups navigation controls with separate tap targets, and makes the cash due the first figure in its own tinted panel. The pickup action remains reachable with the keyboard.

The final captures and Playwright checks cover Arabic 390 px light and dark, French 390 px light, and French 1280 px light and dark. Checks include axe, console errors, horizontal overflow and a 56 px pickup action.
