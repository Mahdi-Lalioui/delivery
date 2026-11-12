import type { PublicLocale } from "@zaafran/i18n/locales";
import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ToastProvider } from "@zaafran/ui";
import { AdminBilling } from "./billing/admin-billing";
import { SiteShell } from "../components/site-shell";

export async function pageMetadata(locale: PublicLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "adminBilling" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function AdminBillingPage({ locale }: { locale: PublicLocale }) {
  const { adminBilling } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/billing">
      <NextIntlClientProvider locale={localeDetails[locale].tag} messages={{ adminBilling }}>
        <ToastProvider closeLabel={adminBilling.closeToast}>
          <AdminBilling locale={locale} />
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
