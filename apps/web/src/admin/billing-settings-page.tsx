import type { PublicLocale } from "@zaafran/i18n/locales";
import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ToastProvider } from "@zaafran/ui";
import { BillingSettings } from "./billing/billing-settings";
import { SiteShell } from "../components/site-shell";

export async function pageMetadata(locale: PublicLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "adminBillingSettings" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function AdminBillingSettingsPage({ locale }: { locale: PublicLocale }) {
  const { adminBillingSettings } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/billing/settings">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ adminBillingSettings }}
      >
        <ToastProvider closeLabel={adminBillingSettings.closeToast}>
          <BillingSettings />
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
