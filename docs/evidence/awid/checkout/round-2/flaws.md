# Checkout — round 2 flaws

Round 1 fixes landed: line prices in a single receipt card with the totals, a restaurant chip in
the header, a rolling total, the zellige pattern on the confirmed moment.

1. **Number rendering.** The rolling total shows "31 00DA": the odometer mangles the narrow space
   and the unit; only the digits should roll, with the unit outside.
2. **Overlap.** The cash card's last line hides behind the fixed action bar; the page's bottom
   padding does not cover the bar.
3. **Wording.** "Votre commande" repeats the page title "Commande"; the section should be named by
   its content ("Récapitulatif").
4. **Legibility.** On the confirmed moment the pattern runs behind the text at full strength and
   the button sits close to the code pill; fade the pattern toward the centre and add space.
5. **Progress.** Done step labels fade to grey; they should keep the text colour so progress reads
   as achieved, not disabled.
