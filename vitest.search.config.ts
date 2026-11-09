import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/db/test/discovery-search-scale.benchmark.ts"],
    globalSetup: ["./packages/db/test/global-setup.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
