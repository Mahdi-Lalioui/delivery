# Restaurant + dish sheet — round 2 flaws

Round 1 fixes landed: "Most ordered" fills to at least three dishes (tagged first) or hides,
compact desktop info card, open badge removed, price and tags in the sheet, photo flies into
the cart with a springing count.

1. **Structure (desktop).** The two-column menu leaves half-empty rows and there is no persistent
   cart; SPRINT asks for "a persistent cart panel" on desktop.
2. **RTL.** Option prices render reversed in Arabic ("دج 150+") because of a forced LTR direction.
3. **Wording.** The Arabic popular tag «مطلوب» also reads as "required", right beside the
   required-group label.
4. **Feedback.** The disabled Add button is a washed-out grey with no reason; it should say what is
   missing ("Choose: Size").
5. **Weight.** On desktop the "Most ordered" photos are as tall as the cover crop and repeat the
   menu below; they need less height.
