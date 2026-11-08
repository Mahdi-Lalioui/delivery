import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinMerchantMenu, {
  generateMetadata as frenchMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/menu/page";
import ArabicMerchantMenu, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/menu/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const ar = { params: Promise.resolve({ merchantId }) };
const fr = { params: Promise.resolve({ merchantId, locale: "fr" }) };
const cases = [
  { locale: "ar", element: <ArabicMerchantMenu {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinMerchantMenu {...fr} />, metadata: () => frenchMetadata(fr) },
] as const;

test.each(cases)(
  "[MER-09:categories] the $locale menu route localizes metadata and preserves the tenant on language links",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { menuCategory } = getMessages(locale);

    expect(html).toContain(menuCategory.title);
    expect(html).toContain(menuCategory.loading);
    expect(html).toContain(`href="/ar/merchant/${merchantId}/menu"`);
    expect(html).toContain(`href="/fr/merchant/${merchantId}/menu"`);
    await expect(metadata()).resolves.toEqual({
      title: menuCategory.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[MER-09:categories] invalid merchant route IDs are rejected before rendering an editor", async () => {
  await expect(
    ArabicMerchantMenu({ params: Promise.resolve({ merchantId: "not-a-merchant-id" }) }),
  ).rejects.toThrow();
});
