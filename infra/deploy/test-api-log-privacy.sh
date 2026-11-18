#!/usr/bin/env bash
set -euo pipefail

origin="${1:?Usage: test-api-log-privacy.sh https://local-web-origin api-container caddy-container}"
api="${2:?Set the local API container name}"
caddy="${3:?Set the local Caddy container name}"
marker="AWID_API_LOG_PROBE_$(date +%s)"
headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT

http_code="$(curl --insecure --silent --show-error --max-time 10 --dump-header "$headers" \
	--output /dev/null --write-out '%{http_code}' --request POST "$origin/v1/auth/otp/request" \
	--header 'content-type: application/json' --header "origin: $origin" \
	--header 'idempotency-key: 00000000-0000-4000-8000-000000000001' \
	--header "X-Awid-Privacy-Probe: $marker" --data "{\"email\":\"$marker\"}")"
[[ "$http_code" == 400 ]]
if docker logs --since 30s "$api" 2>&1 | grep -Fq "$marker"; then
	printf '%s\n' 'The API logged the synthetic request marker.' >&2
	exit 1
fi
if docker logs --since 30s "$caddy" 2>&1 | grep -Fq "$marker"; then
	printf '%s\n' 'Caddy logged the synthetic request marker.' >&2
	exit 1
fi
printf '%s\n' 'API validation and Caddy logs omit the synthetic request marker.'
