# Web in production Compose — local evidence

Date: 18 November 2026. This validates the self-hosted topology with synthetic `awid.localhost`
names and the existing local production-like Docker stack. It does not deploy to a public host.

- `pnpm --filter @zaafran/web build` passed on the host. The output contains
  `.next/standalone/apps/web/server.js` and `.next/static`.
- `docker compose ... --profile build config --quiet` passed with the local Compose environment.
- `docker compose ... build web` passed and created `awid-web:clamav-readiness`. The image uses
  the pinned Node base, builds workspace dependencies before Next, and copies only the standalone
  server, static assets and public assets into the runtime stage.
- `docker compose ... up -d --wait api worker web caddy` passed. API, worker, web, Caddy and
  Martin reported healthy. Web runs read-only as the unprivileged Node user.
- `caddy adapt --validate` passed for Caddy 2.11.9. HTTPS `https://awid.localhost:18544/fr`
  returned 200 with the Next nonce CSP (`frame-ancestors 'none'`), HSTS with subdomains, COOP,
  CORP, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy.
- `https://awid.localhost:18544/v1/wilayas` returned 200, verifying same-origin API routing.
  `https://www.awid.localhost:18544/fr?source=smoke` returned 308 to the bare host and preserved
  the path and query. The redirect carried HSTS and a deny-all CSP.
- A guest request to `/fr/admin/dashboard` returned 307 to `/fr/sign-in?purpose=admin`, confirming
  the standalone server performed the existing role check over the private Compose API connection.
- `infra/deploy/production-smoke.sh https://localhost:18544 https://awid.localhost:18544 https://www.awid.localhost:18544 /private/tmp/awid-uploads.kQvnIH/caddy-root.crt` passed API readiness, catalog, private test-route denial, CSP, web headers and redirect, then failed at the vector-tile check with HTTP 404. The configured `/private/tmp/awid-national-assets/algeria.pmtiles` file is empty, so this local environment cannot prove the real Algeria tile path. The check remains mandatory for staging.

Production DNS, ACME certificates, the actual map extract, and the restore/backup staging check
remain external prerequisites. No Vercel credentials or tokens are used.
