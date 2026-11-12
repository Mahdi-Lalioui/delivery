import type { PublicLocale } from "@zaafran/i18n/locales";
import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ButtonLink, ToastProvider } from "@zaafran/ui";
import { AdminDashboard } from "../retention/analytics/analytics-views";
import { SiteShell } from "../components/site-shell";

export async function pageMetadata(locale: PublicLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "retentionAnalytics" });
  return { title: translate("dashboardTitle"), robots: { index: false, follow: false } };
}

export function AdminDashboardPage({ locale }: { locale: PublicLocale }) {
  const { retentionAnalytics, adminOrders } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/dashboard">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ retentionAnalytics }}
        timeZone="Africa/Algiers"
      >
        <ButtonLink href={`/${locale}/admin/orders`} variant="ghost">
          {adminOrders.title}
        </ButtonLink>
        <ToastProvider closeLabel={retentionAnalytics.closeToast}>
          <AdminDashboard locale={locale} />
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
