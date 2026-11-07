#!/usr/bin/env bash
set -euo pipefail

# Usage: bash infra/scripts/create-algiers-roads.sh [source.osm.pbf] > algiers-roads.osm.pbf
if [[ "$(osmium --version | head -n 1)" != 'osmium version 1.18.0' ]]; then
  printf '%s\n' 'Osmium Tool 1.18.0 is required' >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT

source_url=https://download.geofabrik.de/africa/algeria-261106.osm.pbf
source_md5=dd9b2ae7171221de99646be1bac6c9fa
source_file="${1:-$temp_dir/algeria-261106.osm.pbf}"
if [[ $# -eq 0 ]]; then
  curl --fail --silent --show-error --location --output "$source_file" "$source_url"
fi
actual_md5="$(openssl dgst -md5 -r "$source_file" | cut -d ' ' -f 1)"
if [[ "$actual_md5" != "$source_md5" ]]; then
  printf '%s\n' "Checksum mismatch for $source_file" >&2
  exit 1
fi

osmium extract --strategy complete_ways --bbox 2.96,36.69,3.15,36.83 \
  --output "$temp_dir/algiers.osm.pbf" "$source_file"

# OPL without metadata puts the tag list second. It escapes commas, spaces and equals signs.
# Select public car roads and keep geometry, road class, direction and junction type.
osmium cat --output-format opl,add_metadata=false "$temp_dir/algiers.osm.pbf" \
  | awk '
    /^n/ { print $1, "T", $3, $4 }
    /^w/ {
      count = split(substr($2, 2), tags, ",")
      is_road = 0
      is_restricted = 0
      kept_tags = ""
      for (tag_index = 1; tag_index <= count; tag_index++) {
        tag = tags[tag_index]
        if (tag ~ /^highway=(motorway|trunk|primary|secondary|tertiary)(_link)?$/ ||
            tag ~ /^highway=(residential|unclassified|living_street)$/) {
          is_road = 1
        } else if ((tag ~ /^(access|vehicle|motor_vehicle|motorcar)=/ &&
                    tag !~ /=(yes|permissive|designated)$/) || tag == "area=yes") {
          is_restricted = 1
        } else if (tag !~ /^oneway=(yes|no|1|0|-1|true|false)$/ &&
                   tag !~ /^junction=(roundabout|circular)$/) {
          continue
        }
        kept_tags = kept_tags (kept_tags == "" ? "" : ",") tag
      }
      if (is_road && !is_restricted) print $1, "T" kept_tags, $3
    }
  ' > "$temp_dir/public-roads.osm.opl"

# Only keep nodes referenced by the selected roads.
osmium tags-filter --output-format pbf,add_metadata=false \
  "$temp_dir/public-roads.osm.opl" w/highway
