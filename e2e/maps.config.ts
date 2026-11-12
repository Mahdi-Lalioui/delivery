import { defineConfig } from "@playwright/test";
import auth from "./auth.config.ts";

export default defineConfig({
  ...auth,
  // The API harness uses an ephemeral self-signed certificate. Check tile requests directly.
  use: { serviceWorkers: "block" },
  testMatch: "algeria-maps.spec.ts",
  outputDir: "../test-results/playwright-maps",
});
