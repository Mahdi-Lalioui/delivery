import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/domain/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/domain",
      thresholds: { lines: 95, branches: 90 },
    },
  },
});
