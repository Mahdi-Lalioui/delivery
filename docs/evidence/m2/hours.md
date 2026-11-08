# M2 hours and Ramadan evidence (MER-15, MER-16)

`pnpm exec playwright test --config e2e/auth.config.ts auth-merchant-hours` passed both production-build journeys in `e2e/auth-merchant-hours.spec.ts` (ar 5.3 s, fr 4.5 s). In each locale, an owner opens `/<locale>/merchant/<id>/hours` (`dir` is `rtl` in Arabic). They add a Thursday range of 18:00–02:00, see the "next day" badge, save, and see the range in the seven-day preview as continuing to the next day. They add a Ramadan Thursday range (focus moves to the new range's opening kind), set Maghrib −30, keep the default 02:00 close, and save (focus returns to the Ramadan Save). They switch the preview to Ramadan (`aria-pressed`) and see the Maghrib time with a range closing at 02:00 the next day. After a reload, both schedules read back (18:00 and −30), and the Ramadan preview matches again.

A temporary change of the expected offset to −31 made the French journey fail (`Received: "-30"`), so the readback assertion is real. The value was restored.

The same journeys capture the matrix (light/dark × ar/fr × 390×844 / 1280×800) after the Ramadan save. All 8 cases have zero axe WCAG A/AA/2.1/2.2 AA violations and no horizontal overflow. In the captures, the Ramadan preview shows Thursday 17:14–02:00 against Maghrib at 17:44 for the seeded Algiers location. [Lossless captures](hours/)

Design notes (P2, for the M2-12 design critic): at 1280 px, the preview card wraps into a fourth grid slot below the closed-now card instead of sitting beside the editors. Not covered here: 768×1024, 200% text and a separate design-critic review.

## Dated exceptions

The Arabic and French production journeys created a closed Thursday, saved overnight hours for it, and removed the exception. Each step checked the resulting seven-day preview and read the saved state back after reload. The journeys checked focus on date creation, range creation and removal.

With a saved exception on screen, light and dark checks at 390×844, 768×1024 and 1280×800 passed in Arabic and French with no horizontal overflow or axe WCAG A/AA violations.

The production race regression delays the Ramadan read until a second write saves an exception. Before the fix, the stale weekly save returned 200. After the fix, it returned 409, focused Reload, and a fresh API read confirmed the other exception remained. `pnpm test:e2e:auth --grep @merchant-hours --fail-on-flaky-tests` passed all three journeys.
