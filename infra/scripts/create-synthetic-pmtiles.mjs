import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

if (!execFileSync("pmtiles", ["version"], { encoding: "utf8" }).startsWith("pmtiles 1.31.2,")) {
  throw new Error("go-pmtiles 1.31.2 is required");
}

const fixturesDir = join(import.meta.dirname, "../fixtures");
const tempDir = mkdtempSync(join(fixturesDir, ".synthetic-"));
const mbtilesPath = join(tempDir, "synthetic.mbtiles");
const pmtilesPath = join(tempDir, "synthetic.pmtiles");

try {
  using database = new DatabaseSync(mbtilesPath);
  database.exec(`
    CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE tiles (
      zoom_level INTEGER NOT NULL,
      tile_column INTEGER NOT NULL,
      tile_row INTEGER NOT NULL,
      tile_data BLOB NOT NULL,
      PRIMARY KEY (zoom_level, tile_column, tile_row)
    );
  `);

  const insertMetadata = database.prepare("INSERT INTO metadata (name, value) VALUES (?, ?)");
  const metadata = {
    name: "Synthetic development tile",
    description: "One fictional point for local tile server checks",
    format: "pbf",
    bounds: "-180,-85.0511,180,85.0511",
    minzoom: "0",
    maxzoom: "0",
    json: JSON.stringify({ vector_layers: [{ id: "synthetic", fields: {} }] }),
  };
  for (const [name, value] of Object.entries(metadata)) {
    insertMetadata.run(name, value);
  }

  // MVT 2.1 tile containing one property-free point at local coordinates (1024, 1024).
  const tile = Buffer.concat([
    Buffer.from([0x1a, 27, 0x0a, 9]), // Tile.layers, Layer.name
    Buffer.from("synthetic"),
    Buffer.from([0x12, 9, 0x18, 1, 0x22, 5, 9, 0x80, 0x10, 0x80, 0x10]), // Layer.features
    Buffer.from([0x28, 0x80, 0x20, 0x78, 2]), // Layer.extent (4096), Layer.version (2)
  ]);
  database
    .prepare("INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (0, 0, 0, ?)")
    .run(gzipSync(tile));

  execFileSync("pmtiles", ["convert", mbtilesPath, pmtilesPath], { stdio: "inherit" });
  execFileSync("pmtiles", ["verify", pmtilesPath], { stdio: "inherit" });
  renameSync(pmtilesPath, join(fixturesDir, "synthetic.pmtiles"));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
