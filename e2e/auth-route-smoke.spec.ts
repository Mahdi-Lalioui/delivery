import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { withAuthHarness } from "./auth-fixture.ts";
import { authenticate } from "./auth-session-helpers.ts";

const ownerPhone = "+213550000344";
const courierPhone = "+213550000345";
const adminPhone = "+213550000346";

async function inspect(page: Page, url: string) {
  const errors: string[] = [];
  const uncaught = (error: Error) => errors.push(error.message);
  page.on("pageerror", uncaught);
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") errors.push(message.text());
  };
  page.on("console", onConsole);
  try {
    const navigation = await page.goto(url, { waitUntil: "load" });
    expect(navigation?.status(), url).toBe(200);
    const main = page.getByRole("main").first();
    await expect(main, url).toBeVisible();
    await expect(main.locator(".ui-skeleton:visible, [aria-busy=true]:visible")).toHaveCount(0);
    await expect(main.getByRole("alert")).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("dir", url.includes("/ar") ? "rtl" : "ltr");
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      candidates: Array.from(document.querySelectorAll("main *"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 1 && (rect.right > innerWidth + 1 || rect.left < -1);
        })
        .slice(0, 8)
        .map((element) => element.getAttribute("class") ?? element.localName),
    }));
    expect(overflow.width, overflow.candidates.join(", ")).toBeLessThanOrEqual(1);
    expect(errors, url).toEqual([]);
  } finally {
    page.off("pageerror", uncaught);
    page.off("console", onConsole);
  }
}

async function inspectSection(
  { context, paths }: { context: BrowserContext; paths: string[] },
  origin: string,
) {
  const page = await context.newPage();
  try {
    for (const path of paths) {
      const url = origin + path;
      await test.step(path || "/", async () => {
        try {
          await inspect(page, url);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          expect.soft(detail, url).toBe("");
        }
      });
    }
  } finally {
    await page.close();
  }
}

for (const locale of ["ar", "fr"] as const) {
  for (const width of [390, 1280]) {
    test(`[AWID:smoke] ${locale} · ${String(width)} px · production routes`, async ({
      baseURL,
      browser,
    }) => {
      test.setTimeout(180_000);
      await withAuthHarness(
        baseURL,
        async (harness) => {
          const contexts = await Promise.all(
            ["public", "owner", "courier", "admin"].map(() =>
              browser.newContext({
                ignoreHTTPSErrors: true,
                viewport: { width, height: 900 },
                serviceWorkers: "block",
              }),
            ),
          );
          const [guest, owner, courier, admin] = contexts;
          if (!guest || !owner || !courier || !admin) throw new Error("Missing browser contexts.");
          try {
            await authenticate(owner.request, harness, { phone: ownerPhone });
            await authenticate(courier.request, harness, { phone: courierPhone });
            await authenticate(admin.request, harness, { phone: adminPhone, admin: true });
            const { merchantId, categoryId, slug } = await harness.seedOrderJourney({
              ownerPhone,
              courierPhone,
              timeoutSeconds: 480,
            });
            const merchant = "/merchant/" + merchantId;
            const sections = [
              {
                context: guest,
                paths: [
                  "",
                  "/credits",
                  "/discover",
                  "/restaurants",
                  "/restaurants/" + slug,
                  "/sign-in",
                ],
              },
              {
                context: owner,
                paths: [
                  "/account",
                  "/account/privacy",
                  "/account/sessions",
                  "/checkout",
                  "/orders",
                  "/merchant",
                  "/merchant/apply",
                  ...[
                    "/setup",
                    "/board",
                    "/menu",
                    "/menu/options",
                    `/menu/${categoryId}/items`,
                    "/profile/photos",
                    "/hours",
                    "/delivery-settings",
                    "/promotions",
                    "/billing",
                    "/staff",
                    "/reviews",
                    "/analytics",
                    "/share",
                  ].map((suffix) => merchant + suffix),
                ],
              },
              { context: courier, paths: ["/courier"] },
              {
                context: admin,
                paths: [
                  "/admin/orders",
                  "/admin/dashboard",
                  "/admin/merchant-applications",
                  "/admin/menu-items",
                  "/admin/billing",
                  "/admin/billing/settings",
                  "/admin/platform",
                ],
              },
            ];
            for (const section of sections) {
              await inspectSection(section, `${harness.origin}/${locale}`);
            }
          } finally {
            await Promise.all(contexts.map((context) => context.close()));
          }
        },
        true,
      );
    });
  }
}
