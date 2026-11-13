# M2 hours and Ramadan evidence (MER-15, MER-16)

`pnpm exec playwright test --config e2e/auth.config.ts auth-merchant-hours` passed both production-build journeys in `e2e/auth-merchant-hours.spec.ts` (ar 5.3 s, fr 4.5 s). In each locale, an owner opens `/<locale>/merchant/<id>/hours` (`dir` is `rtl` in Arabic). They add a Thursday range of 18:00–02:00, see the "next day" badge, save, and see the range in the seven-day preview as continuing to the next day. They add a Ramadan Thursday range (focus moves to the new range's opening kind), set Maghrib −30, keep the default 02:00 close, and save (focus returns to the Ramadan Save). They switch the preview to Ramadan (`aria-pressed`) and see the Maghrib time with a range closing at 02:00 the next day. After a reload, both schedules read back (18:00 and −30), and the Ramadan preview matches again.

A temporary change of the expected offset to −31 made the French journey fail (`Received: "-30"`), so the readback assertion is real. The value was restored.

The same journeys capture the matrix (light/dark × ar/fr × 390×844 / 1280×800) after the Ramadan save. All 8 cases have zero axe WCAG A/AA/2.1/2.2 AA violations and no horizontal overflow. In the captures, the Ramadan preview shows Thursday 17:14–02:00 against Maghrib at 17:44 for the seeded Algiers location. [Lossless captures](hours/)

Design notes (P2, for the M2-12 design critic): at 1280 px, the preview card wraps into a fourth grid slot below the closed-now card instead of sitting beside the editors. Not covered here: 768×1024, 200% text and a separate design-critic review.

## Special dates (2026-11-13, Claude covering while Codex was out)

The same two journeys now also cover dated exceptions. After the Ramadan save, the owner chooses **Add a special date**, and focus moves to the new date input. They set 2026-12-31, see "closed all day", add a range (focus moves to its opening time), set 10:00–14:00 and save the weekly form. After a reload, the date and both times read back. The matrix is now captured with this special date listed, and all 8 cases still have zero axe violations and no overflow. The owner then removes the date by its date-specific name. Focus moves to **Add a special date**, the empty-list text shows, and after saving and reloading no special date remains. `pnpm test:e2e:auth --grep @merchant-hours` passed both locales. The captures in [hours/](hours/) were replaced with these runs.

Not covered by the browser journey: the focus after removing a single special-date range, and the default start date (today in Africa/Algiers).

