import { expect, test } from "@playwright/test";
import { withAuthHarness } from "./auth-fixture.ts";
import { authenticate } from "./auth-session-helpers.ts";

const adminPages = [
  "billing",
  "billing/settings",
  "dashboard",
  "menu-items",
  "merchant-applications",
  "orders",
  "platform",
];

for (const locale of ["ar", "fr", "en"]) {
  test(`[AUTH-05] ${locale} admin pages redirect before rendering for guests`, async ({
    request,
  }) => {
    for (const page of adminPages) {
      const response = await request.get(`/${locale}/admin/${page}`, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      const target = new URL(response.headers()["location"] ?? "", response.url());
      expect(target.pathname).toBe(`/${locale}/sign-in`);
      expect(target.searchParams.get("purpose")).toBe("admin");
    }
  });
}

test("[AUTH-05] a standard session cannot render the admin workspace", async ({
  baseURL,
  request,
}) => {
  await withAuthHarness(baseURL, async (harness) => {
    await authenticate(request, harness, { phone: "+213550000791" });
    const response = await request.get(harness.origin + "/fr/admin/dashboard", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers()["location"] ?? "", response.url()).pathname).toBe(
      "/fr/sign-in",
    );
  });
});
