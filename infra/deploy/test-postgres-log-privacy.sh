#!/usr/bin/env bash
set -euo pipefail

api="${1:?Usage: test-postgres-log-privacy.sh api-container database-container}"
database="${2:?Set the local Postgres container name}"
marker="awid-postgres-log-probe-$(date +%s)@example.invalid"

docker exec --workdir /app/packages/db --interactive --env "AWID_LOG_PROBE_MARKER=$marker" "$api" \
	node --input-type=module >/dev/null <<'JS'
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let observedDuplicate = false;
try {
  await sql.begin(async (tx) => {
    // The duplicate insert rolls back both statements. Use real application privileges.
    const email = process.env.AWID_LOG_PROBE_MARKER;
    await tx`INSERT INTO public.users (email, created_at) VALUES (${email}, now())`;
    await tx`INSERT INTO public.users (email, created_at) VALUES (${email}, now())`;
  });
} catch (error) {
  observedDuplicate = error?.code === "23505";
  if (!observedDuplicate) console.error("Postgres log probe failed with code", error?.code ?? "unknown");
} finally {
  await sql.end();
}
if (!observedDuplicate) process.exitCode = 1;
JS

if docker logs --since 30s "$database" 2>&1 | grep -Fq "$marker"; then
	printf '%s\n' 'PostgreSQL logged a synthetic unique-key value.' >&2
	exit 1
fi
printf '%s\n' 'PostgreSQL error logs omit synthetic parameter and query data.'
