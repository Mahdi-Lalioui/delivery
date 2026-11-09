import { expect, test } from "@playwright/test";

for (const locale of ["ar", "fr", "en"]) {
  test(`[CUS-25:browser] launches the installed customer app in ${locale} @smoke`, async ({
    page,
    request,
  }) => {
    const discovery = "/" + locale + "/discover";
    await page.goto(discovery);
    const manifestPath = "/pwa/" + locale + "/app.webmanifest";
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", manifestPath);
    const response = await request.get(manifestPath);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");
    const manifest: unknown = await response.json();
    expect(manifest).toMatchObject({
      id: "/discover",
      start_url: discovery,
      display: "standalone",
      icons: expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    });
    if (
      !manifest ||
      typeof manifest !== "object" ||
      !("start_url" in manifest) ||
      typeof manifest.start_url !== "string"
    )
      throw new Error("Missing launch URL");
    await page.goto(manifest.start_url);
    await expect(page).toHaveURL(new RegExp(discovery + "$", "u"));
    await expect(page.getByRole("main")).toBeVisible();
  });
}

test("[CUS-25:browser] serves normal and maskable PNG icons @smoke", async ({ request }) => {
  for (const size of [192, 512]) {
    const icon = await request.get(`/pwa/icon-${String(size)}.png`);
    expect(icon.ok()).toBe(true);
    expect(icon.headers()["content-type"]).toBe("image/png");
    const bytes = await icon.body();
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
});
