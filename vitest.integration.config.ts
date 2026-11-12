import { integrationTestPatterns } from "@zaafran/config/test-patterns";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    ...integrationTestPatterns,
    globalSetup: ["./packages/db/test/global-setup.ts"],
    fileParallelism: true,
    // Each worker clones and migrates a database on the shared PostGIS instance.
    maxWorkers: 4,
    hookTimeout: 30_000,
  },
});
