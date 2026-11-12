#!/usr/bin/env bash
set -euo pipefail

backup="${1:-${AWID_RESTORE_BACKUP:-}}"
backup="${backup:?Usage: restore-drill.sh BACKUP_DIRECTORY AGE_IDENTITY_FILE}"
identity="${2:-${AWID_RESTORE_IDENTITY:-}}"
identity="${identity:?Set the age recovery identity file}"
directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
image='postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de'

for file in "$identity" "$backup/postgres.dump.age" "$backup/media.tar.age"; do
  if [[ ! -f "$file" || ! -r "$file" ]]; then
    printf '%s\n' 'The recovery identity and both encrypted archives must be readable files.' >&2
    exit 1
  fi
done

umask 077
scratch="$(mktemp -d)"
container=''
cleanup() {
  local status=$?
  if [[ -n "$container" ]] && ! docker rm --force --volumes "$container" >/dev/null 2>&1; then
    printf 'Could not remove recovery container %s and its volume.\n' "$container" >&2
    status=1
  fi
  if ! rm -rf -- "$scratch"; then
    printf '%s\n' 'Could not remove recovery scratch files.' >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
SECONDS=0

container="$(docker run --detach --network none --log-driver none --platform linux/amd64 \
  --label com.awid.restore-drill=true --security-opt no-new-privileges=true \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=postgres "$image")"

for ((attempt = 1; attempt <= 60; attempt += 1)); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ((attempt > 60)); then
  printf '%s\n' 'The disposable PostGIS database did not become ready.' >&2
  exit 1
fi

# The image initializes extensions in its default database. The dump needs a pristine target.
if ! docker exec "$container" createdb -U postgres --template=template0 awid_recovered \
  > "$scratch/database.log" 2>&1; then
  printf '%s\n' 'Could not create an empty recovery database.' >&2
  exit 1
fi

if ! { age -d -i "$identity" "$backup/postgres.dump.age" \
  | docker exec -i "$container" pg_restore -U postgres -d awid_recovered \
    --no-owner --no-privileges --exit-on-error; } > "$scratch/database.log" 2>&1; then
  printf '%s\n' 'Database recovery failed. Check the identity, backup integrity and PostGIS version.' >&2
  exit 1
fi

if ! docker exec -i "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d awid_recovered \
  > "$scratch/references.jsonl" 2> "$scratch/database.log" <<'SQL'
WITH objects AS (
  SELECT variant->>'key' AS key, (variant->>'bytes')::bigint AS bytes
  FROM public.media_uploads AS upload
  CROSS JOIN LATERAL jsonb_array_elements(upload.ready_variants) AS variants(variant)
  WHERE status = 'ready' AND NOT delivery_proof_purging
  UNION ALL
  SELECT quarantine_key, bytes FROM public.media_uploads
  WHERE status IN ('preparing', 'awaiting_crop', 'processing') AND NOT delivery_proof_purging
  UNION ALL
  SELECT preview_key, NULL FROM public.media_uploads
  WHERE status IN ('awaiting_crop', 'processing') AND NOT delivery_proof_purging
  UNION ALL
  SELECT quarantine_key, bytes FROM public.billing_proof_media WHERE status = 'preparing'
  UNION ALL
  SELECT ready_key, ready_bytes FROM public.billing_proof_media WHERE status = 'ready'
)
SELECT json_build_object('key', key, 'bytes', bytes) FROM objects ORDER BY key;
SQL
then
  printf '%s\n' 'Could not read media references from the recovered database.' >&2
  exit 1
fi

if ! checked="$(age -d -i "$identity" "$backup/media.tar.age" 2> "$scratch/age.log" \
  | python3 "$directory/verify-restored-media.py" "$scratch/media" "$scratch/references.jsonl")"; then
  printf '%s\n' 'Media recovery failed. Check the archive and recovery identity.' >&2
  exit 1
fi
printf 'Restore drill passed in %s seconds and verified %s referenced media files.\n' "$SECONDS" "$checked"
