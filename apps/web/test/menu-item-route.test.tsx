import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinItems, {
  generateMetadata as latinMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/menu/[categoryId]/items/page";
import ArabicItems, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/menu/[categoryId]/items/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const categoryId = "019d6abc-1234-7234-8234-123456789001";
const route = `/merchant/${merchantId}/menu/${categoryId}/items`;
const ar = { params: Promise.resolve({ merchantId, categoryId }) };
const fr = { params: Promise.resolve({ merchantId, categoryId, locale: "fr" }) };
const en = { params: Promise.resolve({ merchantId, categoryId, locale: "en" }) };

test.each([
  { locale: "ar", element: <ArabicItems {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinItems {...fr} />, metadata: () => latinMetadata(fr) },
  { locale: "en", element: <LatinItems {...en} />, metadata: () => latinMetadata(en) },
] as const)(
  "[I18N-01] the $locale item route is private and locale switches retain both IDs",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { menuItem } = getMessages(locale);
    expect(html).toContain(menuItem.title);
    expect(html).toContain(menuItem.loading);
    for (const alternate of ["ar", "fr", "en"]) {
      expect(html).toContain(`href="/${alternate}${route}"`);
    }
    expect(html).toContain(`href="/${locale}/merchant/${merchantId}/menu"`);
    await expect(metadata()).resolves.toEqual({
      title: menuItem.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[MER-09:items] rejects invalid merchant and category IDs", async () => {
  await expect(
    ArabicItems({ params: Promise.resolve({ merchantId, categoryId: "bad" }) }),
  ).rejects.toThrow();
  await expect(
    ArabicItems({ params: Promise.resolve({ merchantId: "bad", categoryId }) }),
  ).rejects.toThrow();
});
