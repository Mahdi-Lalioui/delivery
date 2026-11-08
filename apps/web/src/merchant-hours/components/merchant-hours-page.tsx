import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import "../../menu-item/components/menu-item.css";
import { MerchantHoursScreen } from "./merchant-hours-screen";
import "./merchant-hours.css";

export async function merchantHoursMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "merchantHours" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MerchantHoursPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/hours`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantHours: getMessages(locale).merchantHours }}
      >
        <MerchantHoursScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
