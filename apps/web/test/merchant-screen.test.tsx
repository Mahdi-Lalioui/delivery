import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { generateMetadata as generateFrenchStatusMetadata } from "../src/app/[locale]/merchant/page";
import { generateMetadata as generateArabicApplicationMetadata } from "../src/app/ar/merchant/apply/page";
import { MerchantScreen } from "../src/merchant/components/merchant-screen";
import { useMerchantResource } from "../src/merchant/use-merchant-resource";

vi.mock("../src/merchant/use-merchant-resource", () => ({ useMerchantResource: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const resource = vi.mocked(useMerchantResource);
const retry = vi.fn();
const commune = {
  id: "019d6abc-1234-7234-8234-123456789abc",
  code: "1601",
  wilayaCode: 16,
  nameAr: "الجزائر الوسطى",
  nameFr: "Alger centre",
};

function render(screen: "application" | "status") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" messages={{ merchant: getMessages("ar").merchant }}>
      <MerchantScreen locale="ar" screen={screen} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => resource.mockReset());

test("[MER-01] guests can start from the Arabic application and verify a phone with the safe return link", () => {
  resource.mockReturnValueOnce({ view: { kind: "unauthenticated" }, retry });
  const html = render("application");
  const { merchant } = getMessages("ar");

  expect(html).toContain(merchant.applicationTitle);
  expect(html).toContain(merchant.signInRequired);
  expect(html).toContain('href="/ar/sign-in?continue=merchant-apply"');
  expect(html).toContain('href="/ar/merchant"');
  expect(html).not.toContain("<form");
});

test("[MER-01] the authenticated form displays localized communes and labelled editable pin coordinates", () => {
  resource
    .mockReturnValueOnce({
      view: { kind: "ready", data: { sessionId: commune.id, memberships: [] } },
      retry,
    })
    .mockReturnValueOnce({ view: { kind: "ready", data: [commune] }, retry });
  const html = render("application");
  const { merchant } = getMessages("ar");

  expect(html).toContain(merchant.verifiedPhone);
  expect(html).toMatch(/<form\b[^>]*method="post"/);
  expect(html).toContain(`<option value="${commune.id}">${commune.nameAr}</option>`);
  expect(html).toContain(merchant.useLocation);
  for (const name of ["latitude", "longitude"]) {
    expect(html).toMatch(
      new RegExp(
        `<input\\b(?=[^>]*name="${name}")(?=[^>]*dir="ltr")(?=[^>]*inputMode="decimal")`,
        "i",
      ),
    );
  }
  expect(html).not.toMatch(/<input\b[^>]*type="tel"/);
});

test("[MER-01] the status view shows persisted roles and decisions and offers a new application", () => {
  resource.mockReturnValueOnce({
    view: {
      kind: "ready",
      data: {
        sessionId: commune.id,
        memberships: [
          {
            merchantId: commune.id,
            restaurantName: "مطعم افتراضي",
            role: "manager",
            status: "approved",
          },
        ],
      },
    },
    retry,
  });
  const html = render("status");
  const { merchant } = getMessages("ar");

  expect(html).toContain("مطعم افتراضي");
  expect(html).toContain(merchant.roleManager);
  expect(html).toContain(merchant.statusApproved);
  expect(html).toContain('href="/ar/merchant/apply"');
});

test("[I18N-01] public applications expose localized alternatives and personal status stays unindexed", async () => {
  await expect(generateArabicApplicationMetadata()).resolves.toEqual({
    title: getMessages("ar").merchant.applicationTitle,
    alternates: {
      languages: {
        "ar-DZ": "/ar/merchant/apply",
        "fr-DZ": "/fr/merchant/apply",
        en: "/en/merchant/apply",
      },
    },
  });
  await expect(
    generateFrenchStatusMetadata({ params: Promise.resolve({ locale: "fr" }) }),
  ).resolves.toEqual({
    title: getMessages("fr").merchant.statusTitle,
    robots: { index: false, follow: false },
  });
});
