import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import "../../menu-item/components/menu-item.css";
import "../../merchant-hours/components/merchant-hours.css";
import { MerchantStaffScreen } from "./merchant-staff-screen";

export async function merchantStaffMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "merchantStaff" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MerchantStaffPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/staff`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantStaff: getMessages(locale).merchantStaff }}
      >
        <MerchantStaffScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
