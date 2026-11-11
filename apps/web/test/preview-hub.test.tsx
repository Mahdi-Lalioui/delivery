import { getMessages } from "@zaafran/i18n/messages";
import { ToastProvider } from "@zaafran/ui";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import ArabicPreview, { metadata as arabicMetadata } from "../src/app/ar/preview/page";
import LatinPreview, { metadata as latinMetadata } from "../src/app/[locale]/preview/page";

import ArabicLaneBGallery from "../src/app/ar/dev/gallery/page.design";
import { LaneBGallery } from "../src/admin/gallery/lane-b-gallery";

afterEach(() => {
  vi.unstubAllEnvs();
});

test.each([
  ["fr", "Découvrir les restaurants"],
  ["en", "Explore restaurants"],
  ["ar", "اكتشف المطاعم"],
])(
  "links the %s preview to its local customer experience and example galleries",
  async (locale, label) => {
    vi.stubEnv("ZAAFRAN_PREVIEW_DEMO", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const element =
      locale === "ar"
        ? ArabicPreview()
        : await LatinPreview({ params: Promise.resolve({ locale }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(label);
    expect(html).toContain('src="/preview-catalog/casbah.webp"');
    expect(html).toContain(`href="/${locale}/discover"`);
    expect(html).toContain(`href="/${locale}/dev/gallery?screen=merchant-billing"`);
    expect(html).toContain(`href="/${locale}/dev/gallery?screen=admin-billing"`);
    expect(html).toContain(`href="/${locale}/dev/moments"`);
    expect(html).toContain('href="/ar/preview"');
    expect(html).toContain('href="/en/preview"');
    expect(html).toContain('href="/fr/preview"');
  },
);

test.each([
  [undefined, "preview"],
  ["0", "preview"],
  ["1", "production"],
])("hides both preview routes with flag %s and deployment %s", async (flag, deployment) => {
  vi.stubEnv("ZAAFRAN_PREVIEW_DEMO", flag);
  vi.stubEnv("VERCEL_ENV", deployment);

  expect(() => ArabicPreview()).toThrow(/404/);
  await expect(LatinPreview({ params: Promise.resolve({ locale: "fr" }) })).rejects.toThrow(/404/);
});

test("asks robots to skip both preview route variants", () => {
  expect(arabicMetadata.robots).toEqual({ index: false, follow: false });
  expect(latinMetadata.robots).toEqual({ index: false, follow: false });
});

test("the admin link opens the gallery with the administration billing example selected", async () => {
  const page = await ArabicLaneBGallery({
    searchParams: Promise.resolve({ screen: "admin-billing" }),
  });
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={getMessages("ar")}>
      <ToastProvider closeLabel="إغلاق">
        <LaneBGallery locale="ar" labels={{ screen: "Screen", state: "State" }} {...page.props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

  expect(html).toContain('name="screen" checked="" value="admin-billing"');
});
