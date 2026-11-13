import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinMenuPreview, {
  generateMetadata as frenchMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/menu/preview/page";
import ArabicMenuPreview, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/menu/preview/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789030";
const ar = { params: Promise.resolve({ merchantId }) };
const fr = { params: Promise.resolve({ merchantId, locale: "fr" }) };
const cases = [
  { locale: "ar", element: <ArabicMenuPreview {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinMenuPreview {...fr} />, metadata: () => frenchMetadata(fr) },
] as const;

test.each(cases)(
  "[ADM-04] the $locale preview route preserves its restaurant across localized links",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { menuPreview } = getMessages(locale);

    expect(html).toContain(menuPreview.title);
    expect(html).toContain(menuPreview.loading);
    expect(html).toContain(`href="/ar/merchant/${merchantId}/menu/preview"`);
    expect(html).toContain(`href="/fr/merchant/${merchantId}/menu/preview"`);
    await expect(metadata()).resolves.toEqual({
      title: menuPreview.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[ADM-04] rejects a malformed restaurant ID before rendering the preview", async () => {
  await expect(
    ArabicMenuPreview({ params: Promise.resolve({ merchantId: "invalid" }) }),
  ).rejects.toThrow();
});
