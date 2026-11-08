#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

get() {
  curl --fail --silent --show-error --max-time 10 --noproxy '*' "$@"
}

config="$(docker compose config --format json)"
addresses="$(printf '%s' "$config" | node --input-type=module -e '
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";

  const { services } = JSON.parse(readFileSync(0, "utf8"));
  const images = {
    db: "postgis/postgis:18-3.7@" +
      "sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de",
    martin: "ghcr.io/maplibre/martin:1.16.0@" +
      "sha256:caa63e4618ef8f326141d1a867d6ee15bddcf649260c979193bbf487b433a7e0",
    osrm: "ghcr.io/project-osrm/osrm-backend:v26.11.0-debian@" +
      "sha256:e1929ae2818226284d7ef007329098a30851c11528ab3712bc9c8d68da78278b",
  };

  for (const [name, image] of Object.entries(images)) {
    assert.equal(services[name]?.image, image, `${name} must use its D-001 image pin`);
  }

  const targets = { db: 5432, martin: 3000, osrm: 5000 };
  const addresses = Object.entries(targets).map(([name, target]) => {
    const ports = services[name].ports;
    assert.equal(ports?.length, 1, `${name} must publish one port`);
    const [port] = ports;
    assert.equal(port.target, target, `${name} must publish its service port`);
    assert.equal(port.host_ip, "127.0.0.1", `${name} must bind to loopback`);
    assert.match(port.published, /^[1-9]\d*$/, `${name} must publish a fixed host port`);
    return `${port.host_ip}:${port.published}`;
  });
  console.log(addresses.join(" "));
')"
read -r db_address martin_address osrm_address <<< "$addresses"

docker compose up -d --wait --wait-timeout 120

for service in db martin osrm; do
  container="$(docker compose ps --quiet "$service")"
  [[ -n "$container" ]] || fail "$service has no running container"
  health="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  [[ "$health" == healthy ]] || fail "$service health is $health"
  printf '%s healthy\n' "$service"
done

[[ "$(docker compose port db 5432)" == "$db_address" ]] || fail "Expected database on $db_address"
[[ "$(docker compose port martin 3000)" == "$martin_address" ]] || fail "Expected Martin on $martin_address"
[[ "$(docker compose port osrm 5000)" == "$osrm_address" ]] || fail "Expected OSRM on $osrm_address"
node --input-type=module -e '
  import { createConnection } from "node:net";

  const socket = createConnection(Number(process.argv[1]), "127.0.0.1", () => socket.destroy());
  socket.setTimeout(5000, () => socket.destroy(new Error("PostgreSQL TCP connection timed out")));
' "${db_address##*:}"
db_versions="$(
  docker compose exec -T db sh -ec \
    'psql -XAtw -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT current_setting('server_version_num'), postgis_lib_version();
SQL
)"
[[ "$db_versions" == '180006|3.7.0' ]] || fail "Unexpected database versions: $db_versions"
printf 'PostgreSQL 18.6 and PostGIS 3.7.0 on %s\n' "$db_address"

get "http://$martin_address/synthetic" | node --input-type=module -e '
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";

  const { tilejson, tiles } = JSON.parse(readFileSync(0, "utf8"));
  assert.match(tilejson, /^\d+\.\d+\.\d+$/, "Martin returned no TileJSON version");
  assert.ok(
    Array.isArray(tiles) && tiles.some((url) => url.includes("/synthetic/{z}/{x}/{y}")),
    "Martin returned no synthetic tile URL",
  );
'
tile_response="$(get --output /dev/null --write-out '%{http_code} %{size_download}' \
  "http://$martin_address/synthetic/0/0/0")"
read -r tile_status tile_size <<< "$tile_response"
[[ "$tile_status" == 200 && "$tile_size" -gt 0 ]] || fail "Missing synthetic tile: $tile_response"
printf 'Martin synthetic tile 0/0/0 returned %s bytes\n' "$tile_size"

get "http://$osrm_address/route/v1/driving/3.0562,36.7631;3.0590,36.7574?overview=false" \
  | node --input-type=module -e '
  import assert from "node:assert/strict";
  import { readFileSync } from "node:fs";

  const { code, routes } = JSON.parse(readFileSync(0, "utf8"));
  assert.equal(code, "Ok");
  const { distance, duration } = routes[0] ?? {};
  assert.ok(Number.isFinite(distance) && distance > 0, "Expected a positive OSRM distance");
  assert.ok(Number.isFinite(duration) && duration > 0, "Expected a positive OSRM duration");
  process.stdout.write(`OSRM Algiers route returned ${distance} m in ${duration} s\n`);
'
