import { defineConfig } from "@playwright/test";
import authConfig from "./auth.config.ts";

export default defineConfig({
  ...authConfig,
  testMatch: "team-preview.preview.ts",
  reporter: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ? [["list"], ["json"]] : "list",
  outputDir: "../test-results/team-preview",
});
