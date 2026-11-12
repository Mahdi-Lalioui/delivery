# AWID final sweep (redone 2026-11-12)

Captured against a **production design build** (`next build` + `next start` with the preview
catalog), so there is no development overlay. Every tile is the real screen at its real route,
in a realistic state:

- landing, discover, restaurant, dish sheet (opened from the menu), sign-in, account, credits:
  the live pages on the preview catalog;
- checkout (payment step), confirmed, tracking, rating, orders: the full-page design routes
  `/[locale]/dev/screens/*`, which render the shipped page components with fixture data because
  the preview API is read-only.

`screens/` holds all 48 captures (12 screens × ar 390 light, fr 390 light, fr 1280 light,
ar 390 dark); `sheet-*.png` are the contact sheets; `report.txt` lists each capture with
horizontal overflow and console errors: 48 of 48 clean.

The sweep found one defect, fixed before the final run: the confirmed moment rendered mint on mint
in dark mode.

Design-loop rounds with written flaws are in the per-screen folders (`../<screen>/round-N/flaws.md`).
