import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { BillingSettings } from "../../../../../admin/billing/billing-settings";
import { SiteShell } from "../../../../../components/site-shell";
import { requireLatinLocale, type LatinPageProps } from "../../../../../i18n/latin-locale";
import "../../../../../admin/admin-merchant.css";
import "../../../../../admin/billing/admin-billing.css";

async function requireAdminLocale(props: LatinPageProps): Promise<"en" | "fr"> {
  const locale = await requireLatinLocale(props);
  if (locale === "en" || locale === "fr") return locale;
  notFound();
}

export async function generateMetadata(props: LatinPageProps): Promise<Metadata> {
  const locale = await requireAdminLocale(props);
  const translate = await getTranslations({ locale, namespace: "adminBillingSettings" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export default async function AdminBillingSettingsPage(props: LatinPageProps) {
  const locale = await requireAdminLocale(props);
  const { adminBillingSettings } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/billing/settings">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ adminBillingSettings }}
      >
        <BillingSettings />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
