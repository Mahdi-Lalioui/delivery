import type { PublicLocale } from "@zaafran/i18n/locales";
import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminMerchantQueue } from "./admin-merchant-queue";
import { SiteShell } from "../components/site-shell";

export async function pageMetadata(locale: PublicLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "adminMerchant" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function AdminMerchantApplicationsPage({ locale }: { locale: PublicLocale }) {
  const { adminMerchant, merchant } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/merchant-applications">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ adminMerchant, merchant }}
      >
        <AdminMerchantQueue locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
