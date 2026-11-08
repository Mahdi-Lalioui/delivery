import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { DeviceSessionManager } from "./device-session-manager";
import { SiteShell } from "./site-shell";
import "./device-sessions.css";

export async function deviceSessionsMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "sessions" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function DeviceSessionsPage({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath="/account/sessions">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ sessions: getMessages(locale).sessions }}
      >
        <DeviceSessionManager locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
