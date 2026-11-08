import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { browserTestPattern } from "@zaafran/config/test-patterns";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const designUrl = "http://127.0.0.1:3100";
const productionUrl = "http://127.0.0.1:3101";
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: ".",
  testMatch: browserTestPattern,
  fullyParallel: true,
  forbidOnly: true,
  retries: isCi ? 1 : 0,
  workers: 2,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../playwright-report" }],
    ["json", { outputFile: "../test-results/playwright.json" }],
  ],
  outputDir: "../test-results/playwright",
  use: {
    baseURL: designUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-webkit",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "tablet-chromium",
      grep: /@matrix\b/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @zaafran/web start:design --hostname 127.0.0.1 --port 3100",
      cwd: workspace,
      url: designUrl + "/fr/dev/design",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @zaafran/web start --hostname 127.0.0.1 --port 3101",
      cwd: workspace,
      url: productionUrl + "/fr",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
