import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinMerchantHours, {
  generateMetadata as frenchMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/hours/page";
import ArabicMerchantHours, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/hours/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const ar = { params: Promise.resolve({ merchantId }) };
const fr = { params: Promise.resolve({ merchantId, locale: "fr" }) };
const cases = [
  { locale: "ar", element: <ArabicMerchantHours {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinMerchantHours {...fr} />, metadata: () => frenchMetadata(fr) },
] as const;

test.each(cases)(
  "[MER-15] the $locale hours route localizes metadata and keeps the tenant on language links",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { merchantHours } = getMessages(locale);

    expect(html).toContain(merchantHours.title);
    expect(html).toContain(merchantHours.loading);
    expect(html).toContain(`href="/ar/merchant/${merchantId}/hours"`);
    expect(html).toContain(`href="/fr/merchant/${merchantId}/hours"`);
    await expect(metadata()).resolves.toEqual({
      title: merchantHours.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[MER-15] invalid merchant route IDs are rejected before rendering the hours editor", async () => {
  await expect(
    ArabicMerchantHours({ params: Promise.resolve({ merchantId: "not-a-merchant-id" }) }),
  ).rejects.toThrow();
});
