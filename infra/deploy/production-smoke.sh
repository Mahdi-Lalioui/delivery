#!/usr/bin/env bash
set -euo pipefail

origin="${1:?Usage: production-smoke.sh https://api-host [curl CA certificate]}"
certificate="${2:-}"
options=(--silent --show-error --max-time 15)
if [[ -n "$certificate" ]]; then options+=(--cacert "$certificate"); fi

curl --fail "${options[@]}" "$origin/healthz" | jq -e '.status == "ok"' >/dev/null
curl --fail "${options[@]}" "$origin/readyz" | jq -e '.status == "ready"' >/dev/null
curl --fail "${options[@]}" "$origin/v1/wilayas" | jq -e '.wilayas | length == 69' >/dev/null
bytes="$(curl --fail "${options[@]}" "$origin/tiles/algeria/8/130/99" \
  --output /dev/null --write-out '%{size_download}')"
[[ "$bytes" -gt 0 ]]
status="$(curl "${options[@]}" -o /dev/null \
  --write-out '%{http_code}' "$origin/__test__/outbox")"
[[ "$status" == 404 ]]
printf '%s\n' 'API health, readiness, national catalog, vector tile and private route checks passed.'
