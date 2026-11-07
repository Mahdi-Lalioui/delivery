import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const webOrigin = "http://127.0.0.1:3113";

export default defineConfig({
  testDir: ".",
  testMatch: "auth*.spec.ts",
  forbidOnly: true,
  reporter: "list",
  outputDir: "../test-results/playwright-auth",
  projects: [
    {
      name: "auth-chromium",
      use: { ...devices["Desktop Chrome"], baseURL: webOrigin, ignoreHTTPSErrors: true },
    },
  ],
  webServer: {
    command: "pnpm --filter @zaafran/web start --hostname 127.0.0.1 --port 3113",
    cwd: workspace,
    url: webOrigin + "/fr",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
