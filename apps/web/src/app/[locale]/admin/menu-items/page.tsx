import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminHeldItems } from "../../../../admin/admin-held-items";
import { SiteShell } from "../../../../components/site-shell";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import "../../../../admin/admin-merchant.css";

async function requireAdminLocale(props: LatinPageProps): Promise<"en" | "fr"> {
  const locale = await requireLatinLocale(props);
  if (locale === "en" || locale === "fr") return locale;
  notFound();
}

export async function generateMetadata(props: LatinPageProps): Promise<Metadata> {
  const locale = await requireAdminLocale(props);
  const translate = await getTranslations({ locale, namespace: "adminModeration" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export default async function AdminHeldMenuItemsPage(props: LatinPageProps) {
  const locale = await requireAdminLocale(props);
  const { adminModeration } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/menu-items">
      <NextIntlClientProvider locale={localeDetails[locale].tag} messages={{ adminModeration }}>
        <AdminHeldItems locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
