#!/usr/bin/env bash
set -euo pipefail

config="${1:?Usage: backup.sh /etc/awid/compose.env /var/backups/awid age-recipients.txt}"
destination="${2:?Set the encrypted backup directory}"
recipients="${3:?Set the age recipients file}"
directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose --project-name "${AWID_COMPOSE_PROJECT:-awid}" --env-file "$config"
  -f "$directory/../compose.production.yml")

umask 077
mkdir -p -- "$destination"
staging="$(mktemp -d "$destination/.awid-XXXXXX")"
trap 'rm -rf -- "$staging"' EXIT
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$destination/awid-$timestamp-${staging##*-}"

"${compose[@]}" exec -T db pg_dump --username postgres --dbname awid --format custom \
  | age --encrypt --recipients-file "$recipients" --output "$staging/postgres.dump.age"
"${compose[@]}" exec -T worker tar -C /var/awid/media -cf - . \
  | age --encrypt --recipients-file "$recipients" --output "$staging/media.tar.age"

mv -- "$staging" "$final"
printf 'Encrypted backup pair saved to %s\n' "$final"
