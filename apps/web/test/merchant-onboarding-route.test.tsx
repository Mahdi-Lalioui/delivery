import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinMerchantSetup, {
  generateMetadata as frenchMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/setup/page";
import ArabicMerchantSetup, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/setup/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const ar = { params: Promise.resolve({ merchantId }) };
const fr = { params: Promise.resolve({ merchantId, locale: "fr" }) };
const cases = [
  { locale: "ar", element: <ArabicMerchantSetup {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinMerchantSetup {...fr} />, metadata: () => frenchMetadata(fr) },
] as const;

test.each(cases)(
  "[MER-02] the $locale setup route preserves its restaurant across localized links",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { merchantOnboarding } = getMessages(locale);

    expect(html).toContain(merchantOnboarding.title);
    expect(html).toContain(merchantOnboarding.loading);
    expect(html).toContain(`href="/ar/merchant/${merchantId}/setup"`);
    expect(html).toContain(`href="/fr/merchant/${merchantId}/setup"`);
    await expect(metadata()).resolves.toEqual({
      title: merchantOnboarding.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[MER-02] rejects a malformed restaurant ID before rendering setup", async () => {
  await expect(
    ArabicMerchantSetup({ params: Promise.resolve({ merchantId: "invalid" }) }),
  ).rejects.toThrow();
});
