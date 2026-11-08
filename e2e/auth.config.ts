import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { authPort, loopbackOrigin } from "./ports.ts";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const webOrigin = loopbackOrigin(authPort);

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
    command: `pnpm --filter @zaafran/web start --hostname 127.0.0.1 --port ${authPort}`,
    cwd: workspace,
    url: webOrigin + "/fr",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
