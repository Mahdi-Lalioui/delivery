# Local team demo

From the `demo` branch, start Docker Desktop, install dependencies with
`pnpm install --frozen-lockfile`, then run `pnpm demo`. Keep that terminal open.
The launcher prints the French and Arabic tour links after warming the pages.
Press Ctrl+C to stop the apps. The demo Compose stack uses its own local database
volume and loopback ports.

## Demo logins

| Role | Phone | SMS code | Admin second step |
| --- | --- | --- | --- |
| Customer | +213500000001 | 314159 | |
| Restaurant owner | +213500000002 | 314159 | |
| Admin | +213500000003 | 314159 | 271828 |

Use the normal sign-in page for the customer and owner. Start the admin session at
`/fr/sign-in?purpose=admin` or `/ar/sign-in?purpose=admin`. Open separate browser
profiles to keep role sessions independent.
