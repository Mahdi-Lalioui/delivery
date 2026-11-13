import { openDatabase } from "@zaafran/db/database";
import { createLocalMediaStore } from "@zaafran/media";
import { run } from "graphile-worker";
import sharp from "sharp";
import type { createWorkerOptions } from "../src/runtime.ts";
import type { migrateWorker } from "../src/migrate-worker.ts";

export interface MediaWorkerOptions {
  readonly databaseUrl: string;
  readonly storageRoot: string;
}

function isRuntime(module: unknown): module is { createWorkerOptions: typeof createWorkerOptions } {
  return (
    typeof module === "object" &&
    module !== null &&
    "createWorkerOptions" in module &&
    typeof module.createWorkerOptions === "function"
  );
}

function isMigrator(module: unknown): module is { migrateWorker: typeof migrateWorker } {
  return (
    typeof module === "object" &&
    module !== null &&
    "migrateWorker" in module &&
    typeof module.migrateWorker === "function"
  );
}

// The browser journeys exercise the compiled worker, as production runs it.
async function loadCompiledWorker() {
  const runtime: unknown = await import(new URL("../dist/runtime.js", import.meta.url).href);
  const migrate: unknown = await import(new URL("../dist/migrate-worker.js", import.meta.url).href);
  if (!isRuntime(runtime) || !isMigrator(migrate)) {
    throw new Error("Build the worker before running browser media tests.");
  }
  return { createWorkerOptions: runtime.createWorkerOptions, migrateWorker: migrate.migrateWorker };
}

/** Runs the real `media.process` queue against the harness database and media store. */
export async function startMediaWorker({ databaseUrl, storageRoot }: MediaWorkerOptions) {
  const worker = await loadCompiledWorker();
  await worker.migrateWorker(databaseUrl);
  const database = openDatabase(databaseUrl);
  const media = { store: createLocalMediaStore({ root: storageRoot }), maxPixels: 50_000_000 };
  try {
    const runner = await run({
      ...worker.createWorkerOptions(databaseUrl, database, media),
      noHandleSignals: true,
    });
    return {
      async close() {
        await runner.stop().finally(() => runner.promise);
        await database.close();
      },
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}

/** A generated JPEG, so no real photo ever enters the repository or a test run. */
export function syntheticJpeg(): Promise<Buffer> {
  const width = 1200;
  const height = 900;
  const gradient = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    gradient.writeUInt8(Math.floor((x / width) * 255), index * 3);
    gradient.writeUInt8(Math.floor((y / height) * 255), index * 3 + 1);
    gradient.writeUInt8(96, index * 3 + 2);
  }
  return sharp(gradient, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}
