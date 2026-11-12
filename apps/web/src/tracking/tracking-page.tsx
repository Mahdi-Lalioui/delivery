import { brand } from "@zaafran/config/brand";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../components/site-shell";
import { CustomerData } from "../discovery/customer-data";
import { CustomerTabBar } from "../customer/tab-bar";
import { TrackingScreen } from "./tracking-screen";

export function trackingMetadata(locale: Locale): Metadata {
  const name = locale === "ar" ? brand.arabicName : brand.name;
  return { title: `${getMessages(locale).tracking.title} · ${name}`, robots: { index: false } };
}

export function TrackingPage({ orderId, locale }: { orderId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/orders/${orderId}`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ tracking: getMessages(locale).tracking }}
      >
        <CustomerData>
          <TrackingScreen orderId={orderId} locale={locale} />
        </CustomerData>
      </NextIntlClientProvider>
      <CustomerTabBar locale={locale} current="orders" />
    </SiteShell>
  );
}
