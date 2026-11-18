#!/usr/bin/env bash
set -euo pipefail

api_origin="${1:?Usage: production-smoke.sh https://api-host https://web-host https://www-host [curl CA certificate]}"
web_origin="${2:?Set the public HTTPS web origin}"
www_origin="${3:?Set the public HTTPS www origin}"
certificate="${4:-}"
options=(--silent --show-error --max-time 15)
if [[ -n "$certificate" ]]; then options+=(--cacert "$certificate"); fi
headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT

curl --fail "${options[@]}" "$api_origin/healthz" | jq -e '.status == "ok"' >/dev/null
curl --fail "${options[@]}" "$api_origin/readyz" | jq -e '.status == "ready"' >/dev/null
curl --fail "${options[@]}" "$api_origin/v1/wilayas" | jq -e '.wilayas | length == 69' >/dev/null
status="$(curl "${options[@]}" -o /dev/null \
  --dump-header "$headers" --write-out '%{http_code}' "$api_origin/__test__/outbox")"
[[ "$status" == 404 ]]
grep -Eiq "^Content-Security-Policy:.*default-src 'none'; frame-ancestors 'none'" "$headers"
curl --fail "${options[@]}" --dump-header "$headers" --output /dev/null "$web_origin/fr"
grep -Eiq '^Content-Security-Policy:.*frame-ancestors .none.' "$headers"
grep -Eiq '^Cross-Origin-Opener-Policy: same-origin' "$headers"
grep -Eiq '^Cross-Origin-Resource-Policy: same-origin' "$headers"
grep -Eiq '^X-Frame-Options: DENY' "$headers"
grep -Eiq '^Strict-Transport-Security: .*includeSubDomains' "$headers"
grep -Eiq '^X-Content-Type-Options: nosniff' "$headers"
grep -Eiq '^Referrer-Policy: strict-origin-when-cross-origin' "$headers"
grep -Eiq '^Permissions-Policy: geolocation=\(self\), camera=\(self\), microphone=\(self\)' "$headers"
status="$(curl "${options[@]}" --output /dev/null --dump-header "$headers" \
  --write-out '%{http_code}' "$www_origin/fr?source=smoke")"
[[ "$status" == 308 ]]
grep -Eiq '^Location: https://[^/]+/fr\?source=smoke' "$headers"
bytes="$(curl --fail "${options[@]}" "$web_origin/tiles/algeria/8/130/99" \
  --output /dev/null --write-out '%{size_download}')"
[[ "$bytes" -gt 0 ]]
printf '%s\n' 'API health, web route, CSP, security headers, www redirect, national catalog, vector tile and private route checks passed.'
