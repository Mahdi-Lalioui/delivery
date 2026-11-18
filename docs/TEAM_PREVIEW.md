# AWID team preview

For the local presenter demo, use [DEMO.md](DEMO.md). For a connected team or staging preview,
deploy the production Compose stack in [DEPLOY.md](DEPLOY.md) with the web domain, `www` alias,
API domain and TLS records pointing to the same server. Do not configure a Vercel project.

The demo gallery is available at `/fr/preview` (or `/ar/preview`, `/en/preview`) in the local
preview build. Start with the Algiers landing, search for “shawarma”, open L’Atelier Sidi Yahia,
pick Grande, add the dish to the cart, and reload to show the cart persists. The gallery also
links to restaurant billing, promotions, reviews and analytics, admin operations, and the motion
studies. It labels example screens and mutations clearly.

Run `pnpm test:preview` to build the local optimized preview and exercise its synthetic routes.
The demo adapter serves only sample public reads; orders, login, payments and partner/admin
mutations require the connected backend. Production Compose leaves synthetic preview mode off.
