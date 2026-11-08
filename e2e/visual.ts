import type { Page, TestInfo } from "@playwright/test";

export async function attachPageScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const body = await page.screenshot({
    type: "png",
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  await testInfo.attach(`${name}.png`, { body, contentType: "image/png" });
}
