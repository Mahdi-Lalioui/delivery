#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
map_dir="${ZAAFRAN_MAP_DATA_DIR:-$repo/infra/data/maps}"
pmtiles="${1:-pmtiles}"
mkdir -p "$map_dir"
map_dir="$(cd "$map_dir" && pwd)"

pbf_name="algeria-261106"
pbf_hash="f9783f5c8ed14a9f0a7625c39f9db46ecc373d72fe89984a6e12ed8a893c5a94"
tile_hash="286c47ac20ac77ab0b5d72fdfe8eedbb97edff5e83a38938588562fbd3f54a91"
osrm_image="ghcr.io/project-osrm/osrm-backend:v26.11.0-debian@sha256:e1929ae2818226284d7ef007329098a30851c11528ab3712bc9c8d68da78278b"

verify_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s  %s\n' "$1" "$2" | sha256sum -c -
  else
    printf '%s  %s\n' "$1" "$2" | shasum -a 256 -c
  fi
}

if [[ ! -f "$map_dir/algeria.pmtiles" ]]; then
  "$pmtiles" --quiet extract https://build.protomaps.com/20261107.pmtiles "$map_dir/algeria.part.pmtiles" \
    --bbox=-8.69,18.95,12.01,37.15 --maxzoom=15
  verify_sha256 "$tile_hash" "$map_dir/algeria.part.pmtiles"
  mv "$map_dir/algeria.part.pmtiles" "$map_dir/algeria.pmtiles"
fi
verify_sha256 "$tile_hash" "$map_dir/algeria.pmtiles"
"$pmtiles" verify "$map_dir/algeria.pmtiles"

pbf="$map_dir/$pbf_name.osm.pbf"
if [[ ! -f "$pbf" ]]; then
  curl --fail --location --silent --show-error --continue-at - \
    "https://download.geofabrik.de/africa/$pbf_name.osm.pbf" --output "$pbf.part"
  verify_sha256 "$pbf_hash" "$pbf.part"
  mv "$pbf.part" "$pbf"
fi
verify_sha256 "$pbf_hash" "$pbf"

if [[ ! -f "$map_dir/osrm/$pbf_name.osrm.mldgr" ]]; then
  if [[ -e "$map_dir/osrm" ]]; then
    printf 'Move the incomplete OSRM directory before retrying: %s\n' "$map_dir/osrm" >&2
    exit 1
  fi
  staging="$(mktemp -d "$map_dir/osrm-build.XXXXXX")"
  trap 'rm -rf "$staging"' EXIT
  cp "$pbf" "$staging/$pbf_name.osm.pbf"
  docker run --rm --mount "type=bind,src=$staging,dst=/data" --entrypoint bash "$osrm_image" -ec '
    input="/data/$1"
    osrm-extract --threads 4 --profile /opt/car.lua "$input.osm.pbf"
    osrm-partition --threads 4 "$input.osrm"
    osrm-customize --threads 4 "$input.osrm"
    test -s "$input.osrm.mldgr"
  ' _ "$pbf_name"
  rm "$staging/$pbf_name.osm.pbf"
  mv "$staging" "$map_dir/osrm"
fi
printf 'Algeria map and route data ready in %s\n' "$map_dir"
