import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import "../../menu-item/components/menu-item.css";
import "../../merchant-hours/components/merchant-hours.css";
import { StaffAcceptScreen } from "./staff-accept-screen";

export async function staffAcceptMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "merchantStaff" });
  // The fragment token never reaches the server, and the page must not leak it as a referrer.
  return {
    title: translate("acceptTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export function StaffAcceptPage({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath="/staff/accept">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ merchantStaff: getMessages(locale).merchantStaff }}
      >
        <StaffAcceptScreen locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
