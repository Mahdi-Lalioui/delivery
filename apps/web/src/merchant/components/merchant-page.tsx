import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { MerchantScreen, type MerchantScreenKind } from "./merchant-screen";
import "./merchant.css";

interface MerchantPageProps {
  locale: Locale;
  screen: MerchantScreenKind;
}

export async function merchantMetadata({ locale, screen }: MerchantPageProps): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "merchant" });
  if (screen === "status") {
    return { title: translate("statusTitle"), robots: { index: false, follow: false } };
  }
  return {
    title: translate("applicationTitle"),
    alternates: {
      languages: Object.fromEntries(
        publicLocales.map((language) => [
          localeDetails[language].tag,
          `/${language}/merchant/apply`,
        ]),
      ),
    },
  };
}

export function MerchantPage({ locale, screen }: MerchantPageProps) {
  return (
    <SiteShell locale={locale} subpath={screen === "application" ? "/merchant/apply" : "/merchant"}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{
          merchant: getMessages(locale).merchant,
          mediaPhoto: getMessages(locale).mediaPhoto,
        }}
      >
        <MerchantScreen locale={locale} screen={screen} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
