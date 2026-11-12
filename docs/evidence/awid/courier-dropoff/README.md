# Courier drop-off

These are production-build screenshots using a synthetic assigned delivery. Playwright checks Arabic and French at 390 px and French at 1280 px in both schemes. It also exercises GPS permission, a submitted position, delivery-code confirmation, lockout opening the private photo uploader and reporting a failed delivery.

The first pass placed code confirmation below a tall GPS panel, stretched the cash card, gave the code a full form width, showed three navigation buttons on Android and used the native disclosure triangle. The second pass moves confirmation ahead of GPS, fits the input and cash card to their content, shows Apple Maps on iOS and uses the shared directional icon.

## AWID design pass, 2026-11-12

The first AWID build gave live delivery too little distinction, let the contact link run into the map button, separated turn-by-turn links from the map action, hid the cash due among other figures, and gave the confirmation heading ordinary body weight. The second pass tints the active job, groups map controls with clear spacing, emphasises the cash due, and raises the confirmation heading above the code and slider.

The final captures cover Arabic 390 px light and dark, French 390 px light, and French 1280 px light and dark. Playwright checks axe, console errors and horizontal overflow for each.
