# Local operations evidence

On 12 November 2026, at checkout `46e8e0f`, the synthetic production Compose project
passed `infra/deploy/production-smoke.sh` through local Caddy with its trusted CA.
The command checked process health, database and worker readiness, 69 wilayas,
a nonempty vector tile and absence of the test outbox.

The same checkout passed `bash infra/deploy/test-restore-drill.sh` with real Docker,
PostGIS and age. It restored the synthetic dump, verified four referenced media files,
rejected missing and truncated media, unsafe archive members and corrupt ciphertext,
and cleaned scratch data after a simulated Docker cleanup error.

The smoke run used an existing local stack image. Restart drills and full order
journeys against a freshly built production Compose image remain open.

The disposable `awid-deploy-test` project recovered through Caddy after restarting
API, worker and PostgreSQL one at a time. The API and database restarts briefly
returned 502 and 503 respectively before the entire HTTPS smoke command passed again.
This smoke test exercised readiness and reference data. The stack had no in-flight
order fixture for this run.
