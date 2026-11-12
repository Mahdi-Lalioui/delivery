import type { PublicLocale } from "@zaafran/i18n/locales";
import { localeDetails } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ToastProvider } from "@zaafran/ui";
import { PlatformConsole } from "./platform/platform-console";
import { SiteShell } from "../components/site-shell";

export async function pageMetadata(locale: PublicLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "adminPlatform" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function AdminPlatformPage({ locale }: { locale: PublicLocale }) {
  const { adminPlatform } = getMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/admin/platform">
      <NextIntlClientProvider locale={localeDetails[locale].tag} messages={{ adminPlatform }}>
        <ToastProvider closeLabel={adminPlatform.closeToast}>
          <PlatformConsole />
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
