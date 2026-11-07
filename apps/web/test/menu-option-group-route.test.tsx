import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinLibrary, {
  generateMetadata as latinMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/menu/options/page";
import ArabicLibrary, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/menu/options/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const route = `/merchant/${merchantId}/menu/options`;
const ar = { params: Promise.resolve({ merchantId }) };
const fr = { params: Promise.resolve({ merchantId, locale: "fr" }) };
const en = { params: Promise.resolve({ merchantId, locale: "en" }) };

test.each([
  { locale: "ar", element: <ArabicLibrary {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinLibrary {...fr} />, metadata: () => latinMetadata(fr) },
  { locale: "en", element: <LatinLibrary {...en} />, metadata: () => latinMetadata(en) },
] as const)(
  "[I18N-01] the $locale library route is private and language links retain the merchant",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { menuOptionGroup } = getMessages(locale);
    expect(html).toContain(menuOptionGroup.title);
    expect(html).toContain(menuOptionGroup.loading);
    for (const alternate of ["ar", "fr", "en"]) {
      expect(html).toContain(`href="/${alternate}${route}"`);
    }
    expect(html).toContain(`href="/${locale}/merchant/${merchantId}/menu"`);
    await expect(metadata()).resolves.toEqual({
      title: menuOptionGroup.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[MER-10] rejects a malformed merchant ID before rendering the library", async () => {
  await expect(ArabicLibrary({ params: Promise.resolve({ merchantId: "bad" }) })).rejects.toThrow();
});
