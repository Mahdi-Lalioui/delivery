"""Reproduce the reviewed OSM commune geometry from the dated Geofabrik extract."""

import argparse
import csv
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

import osmium
from shapely.geometry import mapping, shape


PBF_SHA256 = "f9783f5c8ed14a9f0a7625c39f9db46ecc373d72fe89984a6e12ed8a893c5a94"
MAP_SHA256 = "f213696159e6c218f77bf7f167f76c7f1c3d62004a206e5f0bf830fd8a7d34d5"
GEOMETRY_SHA256 = "02085a4cc17096c9b2bb2c520eeabeb6789627dc6c2ccb3b3ee1dac9cf1fc6f9"
COMMUNE_COUNT = 1541


def require_digest(path, expected):
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected:
        raise ValueError(f"Source SHA256 does not match for {path}.")


def read_relation_map():
    path = Path(__file__).with_name("ons-osm-relation-map.csv")
    require_digest(path, MAP_SHA256)
    with path.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    selected = {int(row["osm_relation_id"]): row for row in rows}
    if len(rows) != COMMUNE_COUNT or len(selected) != COMMUNE_COUNT:
        raise ValueError("Expected exactly 1,541 unique source relations.")
    return selected


def write_referenced_subset(source, subset, selected):
    found = set()
    with osmium.BackReferenceWriter(subset, source, relation_depth=1) as writer:
        for relation in osmium.FileProcessor(source, osmium.osm.RELATION):
            row = selected.get(relation.id)
            if row is None:
                continue
            if relation.version != int(row["version"]):
                raise ValueError(f"Unexpected version for relation {relation.id}.")
            writer.add_relation(relation)
            found.add(relation.id)
    if found != set(selected):
        raise ValueError("The source is missing reviewed commune relations.")


def assemble_geometries(subset, selected):
    factory = osmium.geom.GeoJSONFactory()
    geometries = {}
    areas = (
        osmium.FileProcessor(subset)
        .with_areas()
        .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
    )
    for area in areas:
        identifier = area.orig_id()
        if area.from_way() or identifier not in selected:
            continue
        geometry = shape(json.loads(factory.create_multipolygon(area)))
        if identifier in geometries or geometry.geom_type != "MultiPolygon":
            raise ValueError(f"Invalid or repeated boundary type for relation {identifier}.")
        if not geometry.is_valid or geometry.is_empty or geometry.area <= 0:
            raise ValueError(f"Invalid or empty boundary for relation {identifier}.")
        geometries[identifier] = mapping(geometry)
    if set(geometries) != set(selected):
        raise ValueError("The assembly is missing reviewed commune geometries.")
    return geometries


def encode_boundaries(selected, geometries):
    features = [
        {
            "type": "Feature",
            "properties": {
                "ons_commune_code": row["ons_commune_code"],
                "wilaya_code": int(row["wilaya_code"]),
                "osm_relation_id": identifier,
                "osm_relation_version": int(row["version"]),
                "relation_match_method": row["status"],
            },
            "geometry": geometries[identifier],
        }
        for identifier, row in selected.items()
    ]
    collection = {"type": "FeatureCollection", "features": features}
    return (json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_pbf", type=Path)
    parser.add_argument("output_geojson", type=Path)
    args = parser.parse_args()
    if version("osmium") != "4.3.2" or version("shapely") != "2.1.2":
        raise ValueError("Install osmium 4.3.2 and Shapely 2.1.2 for this source pin.")

    require_digest(args.source_pbf, PBF_SHA256)
    selected = read_relation_map()
    with TemporaryDirectory(prefix="zaafran-communes-") as directory:
        subset = Path(directory) / "relations.osm.pbf"
        write_referenced_subset(args.source_pbf, subset, selected)
        geometries = assemble_geometries(subset, selected)
    content = encode_boundaries(selected, geometries)
    if hashlib.sha256(content).hexdigest() != GEOMETRY_SHA256:
        raise ValueError("Assembled boundaries differ from the reviewed snapshot.")
    args.output_geojson.write_bytes(content)


if __name__ == "__main__":
    main()
