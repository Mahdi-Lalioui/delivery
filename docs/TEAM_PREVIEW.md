# Zaafran team preview

Open `/fr/preview` (or `/ar/preview`, `/en/preview`) from the Preview deployment. Start with
the Casbah scene, then search for “shawarma”, open L’Atelier Sidi Yahia, pick Grande, and add the
800 DZD dish to the cart. Reload to show the cart persists. The hub also links to restaurant
billing, promotions, reviews and analytics, admin billing and operations, and the delivery
and cart motion studies. The interface labels the gallery screens as examples.

## Deploy on Vercel

1. Import `Mahdi-Lalioui/delivery` with the **Next.js** preset and **apps/web** as the Root
   Directory. Enable access to workspace files outside that directory.
2. Select Node.js **24.x**. Enable Corepack with `ENABLE_EXPERIMENTAL_COREPACK=1` and keep the
   repository’s pinned pnpm. Use the build command in `apps/web/vercel.json`.
3. Enable Vercel’s system environment variables. Set `ZAAFRAN_PREVIEW_DEMO=1` for **Preview**
   only. Leave `ZAAFRAN_API_ORIGIN` unset for the synthetic demo.
4. Deploy the `lane-a` branch as a Preview and share the Preview URL with the team. Use
   Vercel Deployment Protection if the team should be the only audience.

To run the same demo against a local optimized build, run `pnpm test:preview`. The demo
adapter serves synthetic public reads, and the cart stays in the browser. Orders, login,
payments, and partner/admin mutations need the real backend. The gallery demonstrates
those interfaces with sample data.

For a connected staging preview, configure the HTTPS origin of the existing Fastify
service in `ZAAFRAN_API_ORIGIN` and remove the demo flag. The web rewrites same-origin
`/v1/*` requests to that service. Set the API’s `AUTH_PUBLIC_ORIGIN` to the exact public
preview origin and run PostGIS, migrations, worker and storage separately. The production
Vercel target keeps the synthetic routes disabled.
