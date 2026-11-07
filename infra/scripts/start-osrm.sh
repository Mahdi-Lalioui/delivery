#!/usr/bin/env bash
set -euo pipefail

cd /routing
cp /fixtures/algiers-roads.osm.pbf .

osrm-extract --threads 2 --profile /opt/car.lua algiers-roads.osm.pbf
osrm-partition --threads 2 algiers-roads.osrm
osrm-customize --threads 2 algiers-roads.osrm
exec osrm-routed --algorithm mld algiers-roads.osrm
