# Photo catalogue review (lane B, 18 November 2026)

[Before: the 15 catalogue originals](catalogue-before.jpg) · [After: placeholders where no licensed photo exists](after-placeholders-fr-390.png)

| Photo | Verdict | Action |
|---|---|---|
| `chawarma` (960×640) | Off-style studio render, and **no credit or source anywhere**; rights unknown | Removed, with its variants. Atelier Sidi Yahia's cover is its credited grill plate; the shawarma dishes show the designed plate placeholder |
| `pizza` (960×640) | Same: studio render, **uncredited**, used on the production Pizza chip | Removed, with its variants. The Pizza chip and browse tile show the plate icon or drawing; Le Four de Belcourt has no cover; the landing's cuisine rail drops the pizza card |
| `bourek` | Weak: flat light, fried pastries on paper towel | Kept until a licensed replacement exists (credited) |
| `karantika` | Weak: flat, dull plate | Kept; the landing and chips use the stronger `karantika-sandwich` |
| `chorba` | Busy: saturated red cloth competes with the bowl | Kept for the dish; the landing hero uses `chorba-table` |
| Others (baklawa ×2, brochettes, chakhchoukha, chorba-table, couscous, grill-plate, karantika-sandwich, msemen ×2) | On-style documentary food photography, credited | Kept |

`apps/web/test/landing.test.tsx` now fails if any original in `public/preview-catalog` is missing from the credits, apart from the two proven identical copies of credited `/photos/algeria` files. Licensed replacements for pizza, shawarma, bourek, karantika and chorba are a Mahdi task in [HUMAN_TODO](../../../HUMAN_TODO.md).

## Licensed replacements (18 November 2026)

All five come from Wikimedia Commons under commercial-use licences. Each one was viewed, cropped to 4:3 and graded with the catalogue's own `gradeFoodPhoto` (`packages/media/src/photo-style.ts`), then exported as WebP originals with 320/640/960 variants. They are credited in `apps/web/src/marketing/photo-credits.ts` and `docs/PHOTO_CREDITS.md`. [Graded set](new-five-graded.jpg) · [In the app](after-licensed-fr-390.png)

| Dish | Photo | Author | Licence |
|---|---|---|---|
| Pizza | Margherita Originale.JPG | Mario56 | CC BY-SA 3.0 |
| Shawarma | Handmade Chicken Shawarma Wrap - Lavash.jpg | Andy Li | CC0 |
| Bourek | Bourek in Libya.jpg | NAWARAH ALI FARAJ | CC BY-SA 4.0 |
| Karantika | Calentita.jpg (the same chickpea dish) | Gibmetal77 | CC BY-SA 3.0 |
| Chorba frik | Chorba frik algerienne.jpg | Slothtysloth | CC BY-SA 4.0 |

The review also caught two mislabelled originals. The old "chorba" was a Moroccan harira, and the old "karantika" an Italian farinata. The pizza chip, browse tile, landing card, pizzeria cover and shawarma dishes have their photos back.
