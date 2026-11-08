import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../../components/site-shell";
import "../../admin/admin-merchant.css";
import "../../admin/billing/admin-billing.css";
import "../marketing.css";
import { MomentsShowcase } from "./moments-showcase";

export function momentsMetadata(): Metadata {
  return { robots: { index: false, follow: false } };
}

export function MomentsPage({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ marketingMoments: getMessages(locale).marketingMoments }}
      >
        <MomentsShowcase locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
