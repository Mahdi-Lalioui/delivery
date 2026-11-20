#!/usr/bin/env bash
set -euo pipefail
name=awid-role-check-$$
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
image="${1:?Pass the production PostGIS image reference}"
docker run -d --name "$name" -p 127.0.0.1::5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=awid "$image" >/dev/null
for i in {1..45}; do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d awid >/dev/null; then break; fi
  sleep 1
done
docker cp infra/deploy/init-db.sh "$name:/tmp/awid-init.sh"
docker exec "$name" bash -ec 'mkdir -p /run/secrets; printf "%064d" 1 >/run/secrets/awid_database_password; printf "%064d" 2 >/run/secrets/awid_runtime_password; POSTGRES_USER=postgres bash /tmp/awid-init.sh'
port=$(docker port "$name" 5432/tcp | cut -d: -f2)
DATABASE_URL="postgresql://awid@127.0.0.1:$port/awid" node packages/db/dist/deploy.js
AWID_SPLIT_DATABASE_ROLES=1 DATABASE_URL="postgresql://awid@127.0.0.1:$port/awid" node apps/worker/dist/migrate.js
docker exec "$name" psql -U awid -d awid -v ON_ERROR_STOP=1 -c "REVOKE SELECT ON public.wilayas FROM awid_runtime"
docker exec "$name" env POSTGRES_USER=postgres POSTGRES_DB=awid bash /tmp/awid-init.sh
docker exec "$name" psql -U awid_runtime -d awid -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM wilayas; SELECT id FROM graphile_worker.migrations ORDER BY id DESC LIMIT 1; SELECT graphile_worker.add_job('search_refresh');"
if docker exec "$name" psql -U awid_runtime -d awid -v ON_ERROR_STOP=1 -c "DELETE FROM graphile_worker.migrations"; then exit 1; fi

for statement in "CREATE TABLE public.forbidden (id integer)" "ALTER TABLE public.wilayas ADD COLUMN forbidden integer"; do
  if docker exec "$name" psql -U awid_runtime -d awid -v ON_ERROR_STOP=1 -c "$statement"; then
    exit 1
  fi
done
DATABASE_URL="postgresql://awid_runtime@127.0.0.1:$port/awid" node --input-type=module - <<'JS'
import { runOnce } from "./apps/worker/node_modules/graphile-worker/dist/index.js";
let consumed = false;
await runOnce({
  connectionString: process.env.DATABASE_URL,
  taskList: { search_refresh: () => { consumed = true; } },
});
if (!consumed) throw new Error("Runtime worker did not consume the queued job");
JS
