import { brand } from "@zaafran/config/brand";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { ToastProvider } from "@zaafran/ui";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../components/site-shell";
import { CustomerData } from "../discovery/customer-data";
import { CheckoutScreen } from "./checkout-screen";

export function checkoutMetadata(locale: Locale): Metadata {
  const name = locale === "ar" ? brand.arabicName : brand.name;
  return { title: `${getMessages(locale).checkout.title} · ${name}`, robots: { index: false } };
}

export function CheckoutPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  return (
    <CustomerData>
      <SiteShell locale={locale} subpath="/checkout">
        <NextIntlClientProvider
          locale={localeDetails[locale].tag}
          timeZone="Africa/Algiers"
          messages={{
            checkout: messages.checkout,
            retentionScheduling: messages.retentionScheduling,
          }}
        >
          <ToastProvider closeLabel={messages.merchantBilling.closeToast}>
            <CheckoutScreen locale={locale} />
          </ToastProvider>
        </NextIntlClientProvider>
      </SiteShell>
    </CustomerData>
  );
}
