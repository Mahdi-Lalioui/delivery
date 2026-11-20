# Deploy AWID

AWID runs as a pinned Docker Compose stack on one server. Caddy terminates TLS and is the only service with published ports. It serves the Next.js standalone web container at `AWID_WEB_DOMAIN`, redirects `www.AWID_WEB_DOMAIN` to the bare domain, and serves the API at `AWID_API_HOST`. Browser API and tile requests use same-origin paths through Caddy. The web server uses the API host for server-side role checks. API and worker share a private media volume; PostGIS, OSRM and Martin use private networks.

## Backend server

1. Use a staging server with a static IPv4 address and Docker Compose. Open TCP 80 and 443. For temporary TLS, set the API host to the dashed address plus `.sslip.io`. The address `203.0.113.10` would use `203-0-113-10.sslip.io`. Verify that the name resolves to the server and that ACME can reach it. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
2. Check out the approved Git commit under `/srv/awid`. Install `curl`, `jq`, and the pinned go-pmtiles binary. Prepare and verify the national map data with [MAPS.md](../infra/MAPS.md). The build host needs enough memory and disk for OSRM preprocessing and the HEIC image build.
3. Create a private directory such as `/etc/awid` with mode 0700. Generate three separate 32-byte hex passwords with `openssl rand -hex 32` and save them in `postgres-password` `database-password`, and `runtime-password`. Keep secret files in that directory. If the Postgres container cannot read its mounted secret, allow read access to the container user while keeping the host directory private.
4. Write `migration.env` with `DATABASE_URL=postgresql://awid:<database-password>@db:5432/awid` and `database.env` with `DATABASE_URL=postgresql://awid_runtime:<runtime-password>@db:5432/awid`. Keep both files mode 0600. The migration service uses the owner credential. The API and worker use the runtime credential. These initialization steps apply to a fresh database volume. For existing volumes, use the upgrade procedure below.
5. Write `api.env` with the final web origin in `AUTH_PUBLIC_ORIGIN`, plus independent 32-byte hex values for `AUTH_OTP_KEY` and `AUTH_TOTP_KEY`. Keep the keys stable across releases. Set the delivery credentials below in `api.env`. Keep it mode 0600. Write `worker.env` with the provider and push settings listed in [.env.example](../.env.example). The file may be empty for an infrastructure smoke test.
6. Write `/etc/awid/compose.env` with the paths below. Set `AWID_RELEASE_TAG` to the reviewed short Git SHA for each release.

```dotenv
AWID_RELEASE_TAG=<approved-git-sha>
AWID_API_HOST=<dashed-ip>.sslip.io
AWID_WEB_DOMAIN=<web-domain>
AWID_MAP_DIRECTORY=/srv/awid/infra/data/maps
AWID_POSTGRES_PASSWORD_FILE=/etc/awid/postgres-password
AWID_DB_PASSWORD_FILE=/etc/awid/database-password
AWID_RUNTIME_PASSWORD_FILE=/etc/awid/runtime-password
AWID_MIGRATION_ENV_FILE=/etc/awid/migration.env
AWID_DATABASE_ENV_FILE=/etc/awid/database.env
AWID_API_ENV_FILE=/etc/awid/api.env
AWID_WORKER_ENV_FILE=/etc/awid/worker.env
```

Create DNS A records for the API host, web domain and `www` web domain pointing to the server IP. Use a real domain for launch; `.sslip.io` is suitable only for an API-only smoke because the www name is derived from the configured web domain. Set the backend's `AUTH_PUBLIC_ORIGIN` to `https://<web-domain>`.

Run one command after installing the files. It builds the API, worker and Next.js standalone images, migrates the database, starts the full stack and checks both public domains.

```sh
/srv/awid/infra/deploy/deploy.sh /etc/awid/compose.env https://<api-host> https://<web-domain> https://www.<web-domain>
```

The command validates Compose, builds the API and worker, waits for the data services, runs application and Graphile migrations, loads the public Algeria geography, starts Caddy, and checks TLS, API readiness, the 69 wilayas, a populated vector tile and the absence of a test route. The local-only restaurant seed stays outside this deployment command. Save the previous image tag and take an encrypted backup before deploying a database migration. Roll back by selecting the previous image only if it remains compatible with the migrated schema.

## Upgrade an existing database volume

Take a verified backup and stop the API and worker before switching database
credentials. Keep the existing owner password in `migration.env`. Generate a
separate runtime password, set the new Compose paths above, then run the
following with the same Compose file, project name and env file used for the
deployment:

1. Run `docker compose up -d --wait db` with the new configuration to mount the new secret.
2. Run `docker compose exec -T db bash /docker-entrypoint-initdb.d/30-awid.sh`.
   The initializer adds the runtime role and grants access to existing tables
   without recreating data or resetting passwords.
3. Run the normal deployment command. The migration job installs the queue
   policies before the API and worker start with the runtime credential.

## Sign-in delivery

`GET /v1/auth/methods` lists the configured sign-in methods. Leave a provider’s settings unset to disable its method. Use approved synthetic recipients for smoke tests and keep provider payloads, credentials and identifiers out of logs.

- **SMS through Twilio** requires `AUTH_TWILIO_ACCOUNT_SID`, `AUTH_TWILIO_AUTH_TOKEN` and `AUTH_TWILIO_FROM`. Set the sender approved for Algeria. If both SMS adapters are configured, the API selects Twilio for sends. [Twilio Algeria SMS guidelines](https://www.twilio.com/en-us/guidelines/dz/sms)
- **SMS through the HTTPS webhook** requires `AUTH_SMS_WEBHOOK_URL` and `AUTH_SMS_WEBHOOK_TOKEN`. Use this option by leaving all Twilio settings unset.
- **Email through Resend** requires `AUTH_RESEND_API_KEY` and `AUTH_RESEND_FROM`, an address on a verified domain. Use a sending-only key scoped to that domain. Confirm SPF and DKIM and deliver one Arabic, French and English test message before enabling customer access. [Resend domains](https://resend.com/docs/dashboard/domains/introduction)

Put the same Twilio and Resend settings in `worker.env` to deliver order notifications when push cannot deliver. If the worker uses the SMS webhook, set `ORDER_SMS_WEBHOOK_URL` and `ORDER_SMS_WEBHOOK_TOKEN` there. The worker prefers push, then a verified phone, then a verified email for email-only accounts.

For exhausted worker jobs, set `OPS_ALERT_EMAIL` to a monitored recipient in `worker.env`; it requires the Resend API key and verified sender above. Keep it out of the API environment and never expose it in a client build. The alert includes the internal task name, retry count and time only; it omits job payloads and error text. The local synthetic incident is covered by [worker alert evidence](evidence/awid/ops-alerts.md). Verify delivery to the monitored inbox after configuring the provider.

See [HUMAN_TODO](HUMAN_TODO.md) for provider setup.

### SMS webhook

The API posts `{to, text}` with a bearer credential and an `Idempotency-Key` header. Accept the message once per key and return 2xx only after accepting it. Keys use `otp:` or `invite:` plus the server delivery ID. OTP and invitation retries send the same payload. Keep destination and message text out of gateway logs. Verify delivery using approved provider test numbers before enabling signup.

The web container has no published host port; requests enter through Caddy on the API and web domains. Caddy forwards `/v1/*`, health routes and vector tiles to their existing internal services, with all other web-domain paths proxied to Next.js. The Next.js proxy keeps its per-response nonce CSP and operator role checks. Caddy supplies the remaining security headers and a deny-all CSP fallback only when the upstream did not set one.

For the first connected rollout, verify the API and web images use the same release tag. Confirm the session cookie is host-only, Secure, HttpOnly, and sent on subsequent requests; unsafe cross-origin writes are rejected; public and private media are served separately; and authenticated SSE delivers its first event, heartbeat and replay after reconnect. Verify distinct clients get independent IP rate-limit buckets. Caddy streams event responses without response buffering. The deployment smoke checks the API and web, all security headers, the `www` redirect, the national catalog, a vector tile and absence of a test route.

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

The script streams a PostgreSQL custom-format dump and the private media tar directly into encryption and publishes the pair only after both succeed. Database and file snapshots are sequential.

### Restore drill

On the recovery host, install Docker, `age`, and Python 3. Use encrypted storage for Docker’s data directory and for `TMPDIR`, with room for the database and extracted media. Select an encrypted backup from the separate backup location and run:

```sh
infra/deploy/restore-drill.sh /path/to/encrypted/awid-backup /path/to/recovery-identity
```

For the web release gate, provide the same paths through `AWID_RESTORE_BACKUP` and `AWID_RESTORE_IDENTITY`.

The drill restores the database into a fresh PostGIS container with networking disabled, then extracts the media to private scratch space. It checks live media references and recorded lengths. It reports elapsed time and the number of verified objects, then removes the container, its database volume and scratch files. Record the duration and outcome against the two-hour recovery target. Investigate missing objects before promotion. A full staging recovery also needs the application stack and its configuration.

Use `bash infra/deploy/test-restore-drill.sh` with `age` and `age-keygen` on the path to exercise the drill against disposable synthetic backups.

## Local deployment evidence

The local production-like Compose stack built and started the standalone web image as a non-root, read-only container. HTTPS checks against Caddy verified the web domain, nonce CSP, required security headers, same-origin API forwarding and the 308 `www` redirect. The full deployment smoke remains blocked locally because `/private/tmp/awid-national-assets` has no Algeria PMTiles extract; Martin is healthy but the selected vector tile is absent. The API and worker deployment, migrations and encrypted restore evidence are recorded in [local operations](evidence/awid/local-operations.md). DNS, a real server and a complete map extract remain required for staging.

### Upload malware scanning

The production worker waits for the `clamav-signatures` service on initial
startup. FreshClam checks for signed updates 12 times a day and writes to the
`clamav-signatures` volume. Only the updater can write that volume. The worker
mounts it read-only and requires a signature database no more than three days
old for each preparation job. Keep outbound access to ClamAV's signature
service available from the isolated updater network.

Use `docker compose ps clamav-signatures` and
`docker compose logs --tail 50 clamav-signatures` with the deployment's usual
Compose arguments to check signature health. A missing or stale database
leaves new uploads in quarantine for retry. Existing published photos continue
to be served.

Set `OPS_TELEGRAM_BOT_TOKEN` and `OPS_TELEGRAM_CHAT_ID` together in
`worker.env` to enable Telegram worker alerts. Add the bot to the operations
chat and verify delivery with an approved synthetic terminal job failure.
