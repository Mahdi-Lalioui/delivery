import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import { attachPageScreenshot } from "./visual.ts";

const productionUrl = "http://127.0.0.1:3101";
const locales = [
  { prefix: "ar", lang: "ar-DZ", dir: "rtl" },
  { prefix: "fr", lang: "fr-DZ", dir: "ltr" },
  { prefix: "en", lang: "en", dir: "ltr" },
];

function navigationLink(page: Page, href: string) {
  return page
    .getByRole("navigation")
    .getByRole("link")
    .and(page.locator(`a[href="${href}"]`));
}

async function expectRootRedirect(
  request: APIRequestContext,
  headers: Record<string, string>,
  locale: string,
) {
  const response = await request.get("/", { headers, maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(response.status());
  const destination = new URL(response.headers()["location"] ?? "", response.url());
  expect(destination.pathname).toBe(`/${locale}`);
}

async function expectNoOverflow(page: Page) {
  const { available, used } = await page.evaluate(() => ({
    available: document.documentElement.clientWidth,
    used: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(used, `${page.url()} must fit its viewport`).toBeLessThanOrEqual(available);
}

test("[I18N-01] public locale routes expose language, direction and alternates @smoke", async ({
  page,
}) => {
  for (const { prefix, lang, dir } of locales) {
    const response = await page.goto(`/${prefix}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);

    for (const alternate of locales) {
      const metadata = page.locator(`link[rel="alternate"][hreflang="${alternate.lang}"]`);
      await expect(metadata).toHaveAttribute("href", new RegExp(`/${alternate.prefix}/?$`));
      if (alternate.prefix === prefix) continue;

      const link = navigationLink(page, `/${alternate.prefix}`);
      await expect(link).toBeVisible();
      await expect(link).toHaveAccessibleName(/\S/);
      expect(await link.evaluate((node) => node.tabIndex)).toBeGreaterThanOrEqual(0);
    }
  }
});

test("[I18N-01] locale cookie takes precedence over Accept-Language @smoke", async ({
  request,
}) => {
  await expectRootRedirect(request, { cookie: "NEXT_LOCALE=en", "accept-language": "ar-DZ" }, "en");
});

test("[I18N-01] Accept-Language selects a supported locale @smoke", async ({ request }) => {
  await expectRootRedirect(request, { "accept-language": "de-DE, ar-DZ;q=0.9, fr-DZ;q=0.5" }, "ar");
});

test("[I18N-01] an unsupported language falls back to French @smoke", async ({ request }) => {
  await expectRootRedirect(request, { "accept-language": "de-DE" }, "fr");
});

test("[I18N-01] keyboard language navigation preserves the design guide path @smoke", async ({
  page,
}) => {
  await page.goto("/ar/dev/design");
  const french = navigationLink(page, "/fr/dev/design");
  await expect(french).toBeVisible();
  expect(await french.evaluate((node) => node.tabIndex)).toBeGreaterThanOrEqual(0);
  await french.focus();
  await expect(french).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/fr\/dev\/design$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-DZ");
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
});

test("[I18N-07] the expanded pseudo-locale fits at 360 pixels @smoke @visual", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const heading = page.getByRole("main").getByRole("heading", { level: 1 });

  await page.goto("/en/dev/design");
  await expect(heading).toBeVisible();
  const english = (await heading.innerText()).trim();
  expect(english.length).toBeGreaterThan(0);

  await page.goto("/en-XA/dev/design");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-XA");
  await expect(heading).toBeVisible();
  const pseudo = (await heading.innerText()).trim();
  expect(pseudo.normalize("NFD")).toMatch(/\p{M}/u);
  expect(pseudo.length / english.length).toBeGreaterThanOrEqual(1.3);
  expect(pseudo.length / english.length).toBeLessThanOrEqual(1.6);
  expect(await page.evaluate(() => window.innerWidth)).toBe(360);
  await attachPageScreenshot(page, info, "design-en-XA-360");
  await expectNoOverflow(page);

  await page.goto("/ar/dev/design");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expectNoOverflow(page);
});

test("[M0-8] the Arabic and Latin guides load four self-hosted fonts @smoke", async ({ page }) => {
  const assets = new Set<string>();

  for (const locale of ["ar", "fr"]) {
    const files = new Set<string>();
    const recordFont = (response: Response) => {
      const url = new URL(response.url());
      if (response.ok() && url.pathname.endsWith(".woff2")) files.add(url.href);
    };
    page.on("response", recordFont);
    try {
      await page.goto(`/${locale}/dev/design`);
      const loadedFamilies = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts]
          .filter((font) => font.status === "loaded")
          .map((font) => font.family);
      });
      expect(new Set(loadedFamilies).size).toBeGreaterThanOrEqual(2);
    } finally {
      page.off("response", recordFont);
    }

    expect(files.size, `${locale} needs body and display fonts`).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      expect(new URL(file).origin).toBe(new URL(page.url()).origin);
      assets.add(file);
    }
  }

  expect(assets.size).toBeGreaterThanOrEqual(4);
});

test("[M0-8] the optimized guide scripts have the CSP nonce @smoke", async ({ page }) => {
  const response = await page.goto("/fr/dev/design");
  expect(response?.status()).toBe(200);
  const policy = await response?.headerValue("content-security-policy");
  const scripts = (policy ?? "")
    .split(";")
    .map((directive) => directive.trim())
    .filter((directive) => /^script-src(?:-elem)?\s/.test(directive));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.join(";")).not.toContain("'unsafe-inline'");

  const effective = scripts.find((directive) => directive.startsWith("script-src-elem "));
  const nonce = (effective ?? scripts[0])?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce, "CSP script sources must contain a nonce").toBeTruthy();

  const inlineNonces = await page.locator("script:not([src])").evaluateAll((elements) =>
    elements
      .filter((element) => element instanceof HTMLScriptElement)
      .filter(({ type }) =>
        ["", "module", "text/javascript", "application/javascript"].includes(type),
      )
      .map((script) => script.nonce),
  );
  expect(inlineNonces.length, "The optimized page must have inline scripts").toBeGreaterThan(0);
  expect(new Set(inlineNonces)).toEqual(new Set([nonce]));
});

test("[M0-8] the public production build excludes both design guide routes @smoke", async ({
  request,
}) => {
  expect((await request.get(`${productionUrl}/fr`)).status()).toBe(200);

  for (const locale of ["fr", "en-XA"]) {
    const response = await request.get(`${productionUrl}/${locale}/dev/design`, {
      maxRedirects: 0,
    });
    expect(response.status(), `${locale} guide must be private in production`).toBe(404);
  }
});

const themes: readonly ("light" | "dark")[] = ["light", "dark"];
const backgrounds = {
  light: { token: "#FBF8F3", painted: "rgb(251, 248, 243)" },
  dark: { token: "#0E0C0A", painted: "rgb(14, 12, 10)" },
};

async function checkScreen(
  page: Page,
  info: TestInfo,
  screen: { path: string; theme: keyof typeof backgrounds; screenshot: string },
) {
  await page.emulateMedia({ colorScheme: screen.theme, reducedMotion: "reduce" });
  const response = await page.goto(screen.path);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();

  const background = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      token: root.getPropertyValue("--color-bg").trim().toUpperCase(),
      painted: [root.backgroundColor, getComputedStyle(document.body).backgroundColor],
    };
  });
  expect(background.token).toBe(backgrounds[screen.theme].token);
  expect(background.painted).toContain(backgrounds[screen.theme].painted);
  await attachPageScreenshot(page, info, screen.screenshot);
  await expectNoOverflow(page);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
  ).toEqual([]);
}

for (const locale of ["ar", "fr"]) {
  for (const theme of themes) {
    test(`[M0-10] ${locale} guide in ${theme} mode @smoke @visual @a11y @matrix`, async ({
      page,
    }, info) => {
      await checkScreen(page, info, {
        path: `/${locale}/dev/design`,
        theme,
        screenshot: `design-${locale}-${theme}`,
      });
    });

    test(`[M0-10] ${locale} home in ${theme} mode @smoke @visual @a11y @matrix`, async ({
      page,
    }, info) => {
      await checkScreen(page, info, {
        path: `${productionUrl}/${locale}`,
        theme,
        screenshot: `home-${locale}-${theme}`,
      });
    });
  }
}
