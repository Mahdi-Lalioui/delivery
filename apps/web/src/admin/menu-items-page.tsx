import type { PublicLocale } from "@zaafran/i18n/locales";
import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminHeldItems } from "./admin-held-items";
import { SiteShell } from "../components/site-shell";

export async function pageMetadata(locale: PublicLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "adminModeration" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function AdminHeldMenuItemsPage({ locale }: { locale: PublicLocale }) {
  const { adminModeration } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/menu-items">
      <NextIntlClientProvider locale={localeDetails[locale].tag} messages={{ adminModeration }}>
        <AdminHeldItems locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
