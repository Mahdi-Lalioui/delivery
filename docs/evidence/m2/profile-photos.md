# M2 profile photos and combined onboarding

The French owner opened the profile editor from restaurant setup, cropped a 16:9 cover and 1:1 logo with the keyboard, and saved both. After reload, both images decoded at the expected ratio. Removing the cover preserved the logo and cleared the saved cover after another reload. The production test used synthetic demo artwork, the real media worker, private storage and PostGIS.

The Arabic and French profile captures cover both themes at 390px and 1280px. All eight checks passed axe and overflow assertions. The lead and design critic inspected phone and desktop. [Captures](profile-photos/)

The combined `@merchant-onboarding` browser journey passed from Arabic signup and an application photo through separate French admin approval. The approved merchant built a ten-item menu, including a cropped dish photo and a reusable option. The browser created the category, option group and photographed item. Nine repeated items used authenticated fixtures. The merchant changed prices for the category and imported another item from CSV. The preview showed the image, option, imported item and all ten changed prices. The 203-case authorization matrix passed.

PostGIS verified same-merchant composite references, uploader and kind checks, atomic edits, exact replay, and loss of shared access on detachment. The security reviewer found no P0/P1.
