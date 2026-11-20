#!/usr/bin/env bash
set -euo pipefail

marker="${AWID_CLIENT_SECRET_CANARY:?Set the synthetic build marker}"
if [[ ! -d apps/web/.next/static/chunks ]]; then
  printf '%s\n' 'Build the production web bundle before scanning.' >&2
  exit 1
fi

if rg --text --fixed-strings --files-with-matches --hidden --no-ignore \
    -e "$marker" apps/web/.next/static apps/web/public; then
  printf '%s\n' 'A synthetic server secret reached public web assets.' >&2
  exit 1
else
  result=$?
  if [[ "$result" -ne 1 ]]; then exit "$result"; fi
fi
printf '%s\n' 'Public web assets contain no synthetic server secret markers.'
