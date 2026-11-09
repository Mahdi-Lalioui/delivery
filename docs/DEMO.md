# Local team demo

From the `demo` branch, start Docker Desktop and use Node **26.13.0** and
pnpm **12.18.0**. Install dependencies with `pnpm install --frozen-lockfile`,
then run `pnpm demo` and keep that terminal open.

On Mahdi’s existing checkout, the pinned tools are also available in the ignored
`infra/data/demo-toolchain/bin` directory. Run
`PATH="$PWD/infra/data/demo-toolchain/bin:$PATH" pnpm demo` from the repository root.
The launcher prints the French and Arabic tour links after warming the pages.
Press Ctrl+C to stop the apps. The demo Compose stack uses its own local database
volume and loopback ports. Open `http://127.0.0.1:3310/fr/dev/tour` or
`http://127.0.0.1:3310/ar/dev/tour`.

For a rehearsal in another terminal, install Chromium once with
`pnpm exec playwright install chromium`, then run `pnpm demo:smoke` with the
same Node and pnpm versions while the demo is running.

## Demo logins

| Role | Phone | SMS code | Admin second step |
| --- | --- | --- | --- |
| Customer | +213500000001 | 314159 | |
| Restaurant owner | +213500000002 | 314159 | |
| Admin | +213500000003 | 314159 | 271828 |

Use the normal sign-in page for the customer and owner. Start the admin session at
`/fr/sign-in?purpose=admin` or `/ar/sign-in?purpose=admin`. Open separate browser
profiles to keep role sessions independent.

## Ten-minute presenter script

1. **0:00–1:30 · Landing.** Open the Casbah, move the pointer over the scene,
   then open the restaurant pitch and adjust the monthly order volume.
2. **1:30–2:30 · Motion and design.** Try the tagine and fly-to-cart studies.
   Open the design system and switch the tour between Arabic and French.
3. **2:30–5:30 · Customer.** Choose a commune, search for couscous, open Lune de
   Semoule, choose a portion, and open the cart. Choose **Simuler la commande** to show the timed delivery and rating. Then show a saved order, its receipt,
   the rating form, and the privacy page. Order history and ratings use fixtures.
4. **5:30–8:00 · Restaurant.** In the owner profile, open setup and the menu,
   then show CSV import, photos, Ramadan hours and the SAFRAN15 promotion.
   Continue through analytics, reviews and replies, billing, the share kit, and staff.
5. **8:00–10:00 · Administration.** In the admin profile, start at the dashboard
   and open applications, held items, billing, and the platform console.
