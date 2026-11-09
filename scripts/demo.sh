#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROJECT_NAME=zaafran-demo
export ZAAFRAN_DB_PORT=55432 ZAAFRAN_MARTIN_PORT=3101 ZAAFRAN_OSRM_PORT=5100
export API_HOST=127.0.0.1 API_PORT=3102 PORT=3100
export AUTH_PUBLIC_ORIGIN=http://127.0.0.1:3100
export DATABASE_URL=postgresql://zaafran:zaafran_dev_only@127.0.0.1:55432/zaafran_dev
export NODE_ENV=development ZAAFRAN_LOCAL_DEMO=1
unset ZAAFRAN_API_ORIGIN ZAAFRAN_PREVIEW_DEMO VERCEL_ENV
export AUTH_OTP_KEY="$(openssl rand -hex 32)" AUTH_TOTP_KEY="$(openssl rand -hex 32)"
export MEDIA_STORAGE_ROOT="$PWD/infra/data/demo-media"

docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm exec turbo run dev --filter=@zaafran/api --filter=@zaafran/worker --filter=@zaafran/web &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for() {
  local url="$1"
  for _ in $(seq 1 90); do
    kill -0 "$app_pid" 2>/dev/null || return 1
    if curl --fail --silent --max-time 5 --output /dev/null "$url"; then return 0; fi
    sleep 1
  done
  printf 'Timed out waiting for %s\n' "$url" >&2
  return 1
}

wait_for "http://127.0.0.1:$API_PORT/healthz"
wait_for "$AUTH_PUBLIC_ORIGIN/fr/dev/tour"
while IFS= read -r path; do
  curl --fail --silent --show-error --location --max-time 60 --output /dev/null "$AUTH_PUBLIC_ORIGIN$path"
done < scripts/demo-pages.txt
printf '\nZaafran tour: %s/fr/dev/tour\nArabic: %s/ar/dev/tour\nLeave this terminal running. Ctrl+C stops the apps.\n\n' "$AUTH_PUBLIC_ORIGIN" "$AUTH_PUBLIC_ORIGIN"
wait "$app_pid"
