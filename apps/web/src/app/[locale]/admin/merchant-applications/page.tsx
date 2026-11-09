import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminMerchantQueue } from "../../../../admin/admin-merchant-queue";
import { SiteShell } from "../../../../components/site-shell";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import "../../../../admin/admin-merchant.css";

async function requireAdminLocale(props: LatinPageProps): Promise<"en" | "fr" | "ar"> {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.ZAAFRAN_LOCAL_DEMO === "1" &&
    (await props.params).locale === "ar"
  )
    return "ar";
  const locale = await requireLatinLocale(props);
  if (locale === "en" || locale === "fr") return locale;
  notFound();
}

export async function generateMetadata(props: LatinPageProps): Promise<Metadata> {
  const locale = await requireAdminLocale(props);
  const translate = await getTranslations({ locale, namespace: "adminMerchant" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export default async function AdminMerchantApplicationsPage(props: LatinPageProps) {
  const locale = await requireAdminLocale(props);
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
