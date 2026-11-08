import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import "../admin-merchant.css";
import "./admin-billing.css";
import { MerchantBilling } from "./merchant-billing";

export async function merchantBillingMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "merchantBilling" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MerchantBillingPage({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/billing`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantBilling: getMessages(locale).merchantBilling }}
      >
        <MerchantBilling key={merchantId} merchantId={merchantId} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
