# Local team demo

From the `demo` branch, start Docker Desktop, install dependencies with
`pnpm install --frozen-lockfile`, then run `pnpm demo`. Keep that terminal open.
The launcher prints the French and Arabic tour links after warming the pages.
Press Ctrl+C to stop the apps. The demo Compose stack uses its own local database
volume and loopback ports.
