# Discovery (new brief) — round 3 flaws

Round 2 fixes landed: RTL switches rest on the correct side, "Under 20 min" wording on chips and
sheet, "Premium / Haut de gamme / فاخر" price level, a larger empty-state illustration.

1. **Grid.** Sort pills do not fill their 2 × 2 cells, so the grid looks ragged (fixed after this
   round: pills stretch to the cell).
2. **Wrap.** The four delivery-time pills wrap onto two lines at 390 px; acceptable, but the
   longest label ("Under 45 min") could become "45 min max" if it keeps wrapping.
3. **Count.** The apply button still cannot state a result count (no `totalCount` yet).
4. **Desktop.** The sheet opens as a centred dialog over a dimmed page, as top apps do on wide
   screens; no change needed.
5. **Memorable detail.** The sheet springs up from the bottom and the Filters badge counts what is
   active; the URL keeps every choice, so the back button and sharing work.
