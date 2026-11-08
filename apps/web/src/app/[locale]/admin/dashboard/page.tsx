import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ToastProvider } from "@zaafran/ui";
import { AdminDashboard } from "../../../../retention/analytics/analytics-views";
import { SiteShell } from "../../../../components/site-shell";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import "@zaafran/ui/ui.css";
import "../../../../admin/billing/admin-billing.css";
import "../../../../retention/retention.css";

async function requireAdminLocale(props: LatinPageProps): Promise<"en" | "fr"> {
  const locale = await requireLatinLocale(props);
  if (locale === "en" || locale === "fr") return locale;
  notFound();
}

export async function generateMetadata(props: LatinPageProps): Promise<Metadata> {
  const locale = await requireAdminLocale(props);
  const translate = await getTranslations({ locale, namespace: "retentionAnalytics" });
  return { title: translate("dashboardTitle"), robots: { index: false, follow: false } };
}

export default async function AdminDashboardPage(props: LatinPageProps) {
  const locale = await requireAdminLocale(props);
  const { retentionAnalytics } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/dashboard">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ retentionAnalytics }}
        timeZone="Africa/Algiers"
      >
        <ToastProvider closeLabel={retentionAnalytics.closeToast}>
          <AdminDashboard locale={locale} />
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
