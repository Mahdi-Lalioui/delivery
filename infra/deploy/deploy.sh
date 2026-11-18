#!/usr/bin/env bash
set -euo pipefail

config="${1:?Usage: deploy.sh /etc/awid/compose.env https://api-host https://web-host https://www-host [curl CA certificate]}"
api_origin="${2:?Set the public HTTPS API origin}"
web_origin="${3:?Set the public HTTPS web origin}"
www_origin="${4:?Set the public HTTPS www origin}"
certificate="${5:-}"
directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose=(docker compose --project-name "${AWID_COMPOSE_PROJECT:-awid}" --env-file "$config"
  -f "$directory/../compose.production.yml")

"${compose[@]}" --profile build config --quiet
"${compose[@]}" --profile build build heic migrate web
"${compose[@]}" up -d --wait db martin osrm
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --wait api worker web caddy

for ((attempt = 1; attempt <= 8; attempt += 1)); do
  if "$directory/production-smoke.sh" "$api_origin" "$web_origin" "$www_origin" "$certificate"; then exit 0; fi
  sleep 3
done
exit 1
