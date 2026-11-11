# Tracking — round 2 flaws

Round 1 fixes landed: calm block map, arrival time as the hero, pickup code before the
timeline, desktop map matches the sheet height.

1. **Markers.** The restaurant start marker and home pin did not render (edit missed); the
   destination is still a dot.
2. **Typography (desktop).** The hero time wraps onto two lines in the 22 rem column; it needs a
   heading size and no wrapping there.
3. **Realism.** The route cuts diagonally across blocks; it should run on a street drawn beneath it.
4. **Dark mode.** The code card turns bright mint and outshines the time; it should stay a calm
   surface with mint figures.
5. **Hierarchy.** The status headline ("On the way") competes with the time card right below it;
   it should step down to a label-sized heading.
