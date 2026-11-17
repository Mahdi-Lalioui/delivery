import { expect, request as http, test } from "@playwright/test";
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

async function anotherMerchant(harness: Parameters<Parameters<typeof withAuthHarness>[1]>[0]) {
  const other = await http.newContext({ ignoreHTTPSErrors: true });
  try {
    const phone = "+213550000794";
    await authenticate(other, harness, { phone });
    const [merchant] = await harness.seedMenuMemberships(phone);
    if (!merchant) throw new Error("Missing separate merchant tenant");
    return merchant.merchantId;
  } finally {
    await other.dispose();
  }
}

test("[MER-23] restaurant pages enforce membership and role before rendering", async ({
  baseURL,
  request,
}) => {
  await withAuthHarness(baseURL, async (harness) => {
    const ownerPhone = "+213550000792";
    await authenticate(request, harness, { phone: ownerPhone });
    const memberships = await harness.seedMenuMemberships(ownerPhone);
    const foreignMerchantId = await anotherMerchant(harness);
    const path = harness.origin + "/fr/merchant/";
    const staff = memberships.find(({ role }) => role === "staff");
    const manager = memberships.find(({ role }) => role === "manager");
    const owner = memberships.find(({ role }) => role === "owner");
    if (!staff || !manager || !owner) throw new Error("Missing synthetic merchant memberships");

    for (const [route, status] of [
      [staff.merchantId + "/board", 200],
      [staff.merchantId + "/menu", 307],
      [manager.merchantId + "/menu", 200],
      [manager.merchantId + "/staff", 307],
      [manager.merchantId + "/billing", 307],
      [owner.merchantId + "/staff", 200],
      [foreignMerchantId + "/share", 307],
    ] as const) {
      const response = await request.get(path + route, { maxRedirects: 0 });
      expect(response.status(), route).toBe(status);
      if (status === 307) {
        const target = new URL(response.headers()["location"] ?? "", response.url());
        expect(target.pathname).toBe("/fr/sign-in");
      }
    }
  });
});
