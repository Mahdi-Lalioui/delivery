import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator } from "next-intl";
import { renderToReadableStream } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinMerchantStaff, {
  generateMetadata as frenchMetadata,
} from "../src/app/[locale]/merchant/[merchantId]/staff/page";
import ArabicMerchantStaff, {
  generateMetadata as arabicMetadata,
} from "../src/app/ar/merchant/[merchantId]/staff/page";

vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const ar = { params: Promise.resolve({ merchantId }) };
const fr = { params: Promise.resolve({ merchantId, locale: "fr" }) };
const cases = [
  { locale: "ar", element: <ArabicMerchantStaff {...ar} />, metadata: arabicMetadata },
  { locale: "fr", element: <LatinMerchantStaff {...fr} />, metadata: () => frenchMetadata(fr) },
] as const;

test.each(cases)(
  "[MER-23:web] the $locale staff route localizes metadata and keeps the tenant on language links",
  async ({ locale, element, metadata }) => {
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { merchantStaff } = getMessages(locale);

    expect(html).toContain(merchantStaff.title);
    expect(html).toContain(merchantStaff.loading);
    expect(html).toContain(`href="/ar/merchant/${merchantId}/staff"`);
    expect(html).toContain(`href="/fr/merchant/${merchantId}/staff"`);
    await expect(metadata()).resolves.toEqual({
      title: merchantStaff.title,
      robots: { index: false, follow: false },
    });
  },
);

test("[MER-23:web] invalid merchant route IDs are rejected before rendering the staff page", async () => {
  await expect(
    ArabicMerchantStaff({ params: Promise.resolve({ merchantId: "not-a-merchant-id" }) }),
  ).rejects.toThrow();
});
