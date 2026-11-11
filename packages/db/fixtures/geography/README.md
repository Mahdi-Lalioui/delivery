# Algeria geography fixtures

The geography database contains 69 current wilayas, 1,541 communes and the reviewed boundary for each commune. Wilaya codes are numeric. Commune codes are four-character strings so leading zeroes survive storage and transport. The 2021 ONS code register supplies the stable commune codes. Law 26-06 and Decree 26-206 supply the current wilaya assignments. [ONS code register](https://www.ons.dz/IMG/pdf/code_geo_2021.pdf) · [Law 26-06](https://www.joradp.dz/FTP/jo-francais/2026/F2026025.pdf) · [Decree 26-206](https://www.joradp.dz/FTP/jo-francais/2026/F2026040.pdf)

| File                            |                                                        Records | SHA-256                                                            |
| ------------------------------- | -------------------------------------------------------------: | ------------------------------------------------------------------ |
| `wilayas.json`                  |                                   69 bilingual names and codes | `e85db85be84710aea05d240aea7788ce64318ce2393ec3be9929d63df936840e` |
| `communes.json`                 | 1,541 bilingual names, codes, wilaya assignments and centroids | `e645e9a54544db01b21d1704b79e5ac3379a8ad6eacf350636e71b4cd1223e71` |
| `algiers-boundaries.geojson.gz` |         57 GeoJSON MultiPolygon features keyed by commune code | `f3dc5e25297bfab3d355f9066371ef33a4a7ff32224954496fc78f80d9bd9692` |
| `algeria-boundaries.geojson.gz` |  All 1,541 GeoJSON MultiPolygon features keyed by commune code | `9fe6b50e067e40f6e232791cc69af9801d948aaa1b090062bf563aa940d89047` |

The generator uses GeoAlgeria 2.4.1 for the national catalog of nonspatial names, codes and assignments. The [GeoAlgeria MIT notice](GEODATA-MIT.txt) accompanies those fields. The exact French and Arabic Algiers names come from the aligned official Decree 26-112 lists on page 3. [GeoAlgeria package](https://registry.npmjs.org/geoalgeria/-/geoalgeria-2.4.1.tgz) · [French gazette](https://www.joradp.dz/FTP/jo-francais/2026/F2026019.pdf) · [Arabic gazette](https://www.joradp.dz/FTP/jo-arabe/2026/A2026019.pdf)

## OpenStreetMap attribution

The centroid fields in `communes.json`, both compressed boundary collections and the OSM relation data in the source crosswalk are © OpenStreetMap contributors and available under the Open Database License 1.0. Their coordinate source is the dated Geofabrik Algeria OSM extract, replication sequence 3756 at `2026-11-06T21:21:21Z`. [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) · [Attribution guidelines](https://osmfoundation.org/wiki/Attribution_Guidelines) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) · [Geofabrik source](https://download.geofabrik.de/africa/algeria-261106.osm.pbf)

The reviewed crosswalk records one distinct OSM relation per commune. The relationships include 1,480 exact ONS codes and 59 historical ONS codes. Aïn Defla 4401 was matched by name and boundary. Menaa 0506 uses relation 5200833 version 28 and its exact ONS code. [Aïn Defla relation](https://www.openstreetmap.org/relation/21037899) · [Menaa relation](https://www.openstreetmap.org/relation/5200833)

Dhayet Bendhahoua 4703 uses daïra relation 6823963 version 25 with the exact `ref:ONS=4703` tag. The official gazettes identify Dhayet Bendhahoua as the sole commune in the daïra, so the areas are coextensive. The current commune subarea relation 20152175 contains the admin centre, and former commune relation 4518068 was deleted. [2021 gazette no. 38, page 10](https://www.joradp.dz/FTP/jo-francais/2021/F2021038.pdf) · [2024 gazette no. 59, page 28](https://www.joradp.dz/FTP/jo-francais/2024/F2024059.pdf) · [Dhayet daïra relation](https://www.openstreetmap.org/relation/6823963) · [Commune subarea relation](https://www.openstreetmap.org/relation/20152175)

Centroids use `ST_Centroid(geom::geography, true)` on the full source geometries with PostGIS 3.7.0. The generator extracts WGS84 longitude and latitude and rounds each to seven decimal places. A geometric centroid can fall outside a concave polygon. The nationwide fixture preserves the full source shapes for point containment. The Algiers subset is kept as reproducible evidence of the official label overlay. [PostGIS ST_Centroid](https://postgis.net/docs/ST_Centroid.html)

## Reproduce the snapshot

Use the pinned Node and pnpm toolchain and Docker test service. The optional offline source assembly uses Python 3.12, `osmium` 4.3.2 and `Shapely` 2.1.2. If the dated Geofabrik download has rotated, use archived bytes matching the pinned SHA-256.

| Source                                                                                   | SHA-256                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Algeria Geofabrik PBF](https://download.geofabrik.de/africa/algeria-261106.osm.pbf)     | `f9783f5c8ed14a9f0a7625c39f9db46ecc373d72fe89984a6e12ed8a893c5a94` |
| [GeoAlgeria 2.4.1 tarball](https://registry.npmjs.org/geoalgeria/-/geoalgeria-2.4.1.tgz) | `2658967ab74bb0f98ab3a999586a9de772bc0c56a3934552efe45eb543726d72` |
| [Reviewed ONS to OSM crosswalk](../../tools/geography/ons-osm-relation-map.csv)          | `f213696159e6c218f77bf7f167f76c7f1c3d62004a206e5f0bf830fd8a7d34d5` |
| [Official Algiers labels overlay](../../tools/geography/algiers-official-labels.json)    | `51e4326b7d88dc4f4c8030ad2183e83495aa98500024d314ac1d78538725ba03` |
| Assembled `algeria-commune-boundaries.geojson`                                           | `02085a4cc17096c9b2bb2c520eeabeb6789627dc6c2ccb3b3ee1dac9cf1fc6f9` |

Run from the repository root.

```sh
scratch=$(mktemp -d)
curl -fL https://download.geofabrik.de/africa/algeria-261106.osm.pbf -o "$scratch/algeria.osm.pbf"
curl -fL https://registry.npmjs.org/geoalgeria/-/geoalgeria-2.4.1.tgz -o "$scratch/geoalgeria.tgz"
python3.12 -m venv "$scratch/venv"
"$scratch/venv/bin/pip" install osmium==4.3.2 Shapely==2.1.2
"$scratch/venv/bin/python" packages/db/tools/geography/assemble-osm.py \
  "$scratch/algeria.osm.pbf" "$scratch/algeria-commune-boundaries.geojson"
pnpm install --frozen-lockfile
docker compose up -d --wait db
node packages/db/tools/geography/generate.ts --check \
  "$scratch/geoalgeria.tgz" "$scratch/algeria-commune-boundaries.geojson"
pnpm exec vitest run --coverage.enabled=false packages/db/tools/geography/fixtures.test.ts
```

The generator verifies the inputs and computes centroids in a disposable PostGIS-enabled database. Its default connection is the repository's local test database. Set `DATABASE_URL_TEST` to a dedicated local test database if needed. `--check` compares the regenerated bytes to all four checked-in fixtures. Omit the flag to write the fixtures during a deliberate data refresh.
