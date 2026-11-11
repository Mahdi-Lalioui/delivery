import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../components/site-shell";
import { CourierScreen } from "./courier-screen";
import "@zaafran/ui/ui.css";
import "./courier.css";

export function courierMetadata(locale: Locale): Metadata {
  return {
    title: getMessages(locale).courier.title,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export function CourierPage({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath="/courier">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ courier: getMessages(locale).courier }}
      >
        <CourierScreen locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
