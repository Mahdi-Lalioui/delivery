import { defineConfig } from "vitest/config";
import { unitTestPatterns } from "./test-patterns.ts";

const domainSources = "packages/domain/src/**/*.{ts,tsx}";
const apiSources = "apps/api/src/**/*.{ts,tsx}";
const uiSources = "packages/ui/src/**/*.{ts,tsx}";
const webComponents = "apps/web/**/components/**/*.{ts,tsx}";

export default defineConfig({
  test: {
    environment: "node",
    ...unitTestPatterns,
    coverage: {
      enabled: true,
      provider: "v8",
      include: [
        "apps/{api,web,worker}/src/**/*.{ts,tsx}",
        "packages/{contracts,db,domain,geo,i18n,tokens,ui}/src/**/*.{ts,tsx}",
        webComponents,
      ],
      exclude: [
        "**/{node_modules,.next,dist,coverage}/**",
        "**/*.d.ts",
        "**/{test,tests,__tests__,integration,e2e}/**",
        "**/*.{test,spec}.{ts,tsx}",
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        [domainSources]: { lines: 95, branches: 90 },
        [apiSources]: { lines: 85 },
        [uiSources]: { lines: 70 },
        [webComponents]: { lines: 70 },
      },
    },
  },
});
