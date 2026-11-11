# Deploy AWID

The backend runs as a pinned Docker Compose stack. Caddy terminates TLS and is the only service with published ports. API and worker share a private media volume. PostGIS, OSRM and Martin use private networks. The web runs on Vercel and calls the API and tiles through same-origin rewrites.

## Backend server

1. Use a staging server with a static IPv4 address and Docker Compose. Open TCP 80 and 443. For temporary TLS, set the API host to the dashed address plus `.sslip.io`. The address `203.0.113.10` would use `203-0-113-10.sslip.io`. Verify that the name resolves to the server and that ACME can reach it. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
2. Check out the approved Git commit under `/srv/awid`. Install `curl`, `jq`, and the pinned go-pmtiles binary. Prepare and verify the national map data with [MAPS.md](../infra/MAPS.md). The build host needs enough memory and disk for OSRM preprocessing and the HEIC image build.
3. Create a private directory such as `/etc/awid` with mode 0700. Generate two separate 32-byte hex passwords with `openssl rand -hex 32` and save them in `postgres-password` and `database-password`. Keep secret files in that directory. If the Postgres container cannot read its mounted secret, allow read access to the container user while keeping the host directory private.
4. Write `database.env` with `DATABASE_URL=postgresql://awid:<database-password>@db:5432/awid`. The database initializer creates a database owner without superuser or role-creation privileges.
5. Write `api.env` with the final web origin in `AUTH_PUBLIC_ORIGIN`, plus independent 32-byte hex values for `AUTH_OTP_KEY` and `AUTH_TOTP_KEY`. Keep the keys stable across releases. Write `worker.env` with the provider and push settings listed in [.env.example](../.env.example). The file may be empty for an infrastructure smoke test.
6. Write `/etc/awid/compose.env` with the paths below. Set `AWID_RELEASE_TAG` to the reviewed short Git SHA for each release.

```dotenv
AWID_RELEASE_TAG=<approved-git-sha>
AWID_API_HOST=<dashed-ip>.sslip.io
AWID_MAP_DIRECTORY=/srv/awid/infra/data/maps
AWID_POSTGRES_PASSWORD_FILE=/etc/awid/postgres-password
AWID_DB_PASSWORD_FILE=/etc/awid/database-password
AWID_DATABASE_ENV_FILE=/etc/awid/database.env
AWID_API_ENV_FILE=/etc/awid/api.env
AWID_WORKER_ENV_FILE=/etc/awid/worker.env
```

Run one command after installing the files.

```sh
/srv/awid/infra/deploy/deploy.sh /etc/awid/compose.env https://<api-host>
```

The command validates Compose, builds the API and worker, waits for the data services, runs application and Graphile migrations, loads the public Algeria geography, starts Caddy, and checks TLS, API readiness, the 69 wilayas, a populated vector tile and the absence of a test route. The local-only restaurant seed stays outside this deployment command. Save the previous image tag and take an encrypted backup before deploying a database migration. Roll back by selecting the previous image only if it remains compatible with the migrated schema.

## Vercel

In the `mahdi-2040` team, import `Mahdi-Lalioui/delivery` as a Next.js monorepo project. Set the Root Directory to `apps/web`, include files outside the Root Directory and use the Node LTS line supported by the repo. Keep the build command in [vercel.json](../apps/web/vercel.json). Set `ZAAFRAN_API_ORIGIN=https://<api-host>` in the target environment and use the stable web alias as the backend's `AUTH_PUBLIC_ORIGIN`. Leave `ZAAFRAN_PREVIEW_DEMO` unset on the connected environment. [Vercel monorepos](https://vercel.com/docs/monorepos) · [Vercel rewrites](https://vercel.com/docs/routing/rewrites)

Use a protected Preview with approved synthetic accounts before promotion. On the Vercel hostname, verify that the session cookie is host-only, Secure, HttpOnly, and sent on subsequent requests, and that unsafe cross-origin requests are rejected. Verify public and private media separately. Use an authenticated browser to verify first SSE event delivery, a heartbeat and reconnect replay through the rewrite. Caddy streams event responses without a response buffer. If the hosted rewrite buffers events, keep the client's polling fallback active and verify a same-origin streaming path before enabling live delivery for the pilot. Verify distinct clients get independent IP rate-limit buckets. [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

## Encrypted nightly backups

Install `age` 1.3.2 from its official release and verify the platform checksum. Generate the recovery identity on the recovery machine. Put only its public recipient in `/etc/awid/backup-recipients.txt`. Install the checked-in timer and alert on a nonzero service exit. Copy the encrypted backup directory to the separate backup location. [age release and checksums](https://github.com/FiloSottile/age/releases/tag/v1.3.2)

```sh
/srv/awid/infra/deploy/backup.sh /etc/awid/compose.env /var/backups/awid /etc/awid/backup-recipients.txt
```

Install the nightly timer after verifying a manual backup.

```sh
sudo install -d -m 0700 /var/backups/awid
sudo install -m 0644 /srv/awid/infra/deploy/awid-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now awid-backup.timer
sudo systemctl list-timers awid-backup.timer
```

The script streams a PostgreSQL custom-format dump and the private media tar directly into encryption and publishes the pair only after both succeed. Database and file snapshots are sequential. Run the restore drill in isolation, check attached-media references, and document any missing object before promotion. Decrypt the database archive into `pg_restore` and the media archive into `tar` on the recovery host. Use a separate non-production stack for recovery verification.

## Local deployment evidence

On a disposable Docker project, `deploy.sh` built the arm64 API and worker, ran migrations as the non-superuser role, and passed HTTPS smoke using the local Caddy CA. The check reached a nonempty tile from the national archive. An encrypted backup restored into a separate PostGIS database with 69 wilayas, 1,541 communes and no demo merchants, and the restored private media fixture matched byte-for-byte. The server timer and the Vercel forwarding checks remain staging tasks.
