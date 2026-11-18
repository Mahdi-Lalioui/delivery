#!/usr/bin/env bash
set -euo pipefail

origin="${1:?Usage: test-caddy-failure.sh https://local-web-origin caddy-container web-container}"
caddy="${2:?Set the local Caddy container name}"
web="${3:?Set the local web container name}"
headers="$(mktemp)"
marker="AWID_FAILURE_PROBE_$(date +%s)"

wait_healthy() {
	for _ in $(seq 1 30); do
		state="$(docker inspect --format '{{.State.Health.Status}}' "$web" 2>/dev/null || true)"
		[[ "$state" == healthy ]] && return 0
		sleep 1
	done
	return 1
}

cleanup() {
	docker start "$web" >/dev/null 2>&1 || true
	wait_healthy || true
	rm -f "$headers"
}
trap cleanup EXIT

docker stop "$web" >/dev/null
http_code="$(curl --insecure --silent --show-error --max-time 10 --dump-header "$headers" \
	--user-agent "$marker" --header "X-Awid-Privacy-Probe: $marker" --output /dev/null \
	--write-out '%{http_code}' "$origin/fr/discover?query=$marker")"
[[ "$http_code" == 502 ]]
grep -Eiq "^Content-Security-Policy:.*default-src 'none'; frame-ancestors 'none'" "$headers"
grep -Eiq '^Strict-Transport-Security: .*includeSubDomains' "$headers"
grep -Eiq '^Cross-Origin-Opener-Policy: same-origin' "$headers"
grep -Eiq '^Cross-Origin-Resource-Policy: same-origin' "$headers"
grep -Eiq '^X-Frame-Options: DENY' "$headers"
grep -Eiq '^Permissions-Policy:' "$headers"
if docker logs --since 30s "$caddy" 2>&1 | grep -Fq "$marker"; then
	printf '%s\n' 'Caddy logged the synthetic request marker.' >&2
	exit 1
fi

docker start "$web" >/dev/null
wait_healthy
trap - EXIT
rm -f "$headers"
printf '%s\n' 'Upstream 502 keeps security headers and does not log request content; web container is healthy.'
