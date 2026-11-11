import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../components/site-shell";
import { DeliveryScreen } from "./delivery-screen";
import "@zaafran/ui/ui.css";
import "./delivery-settings.css";

export function deliveryMetadata(locale: Locale): Metadata {
  return {
    title: getMessages(locale).merchantDelivery.title,
    robots: { index: false, follow: false },
  };
}

export function MerchantDeliveryPage({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/delivery-settings`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantDelivery: getMessages(locale).merchantDelivery }}
      >
        <DeliveryScreen key={merchantId} locale={locale} merchantId={merchantId} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
