import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../components/site-shell";
import { MerchantBoardScreen } from "./board-screen";
import "./board.css";

export function boardMetadata(locale: Locale): Metadata {
  return {
    title: getMessages(locale).merchantBoard.title,
    robots: { index: false, follow: false },
  };
}

export function MerchantBoardPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/board`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantBoard: getMessages(locale).merchantBoard }}
      >
        <MerchantBoardScreen key={merchantId} locale={locale} merchantId={merchantId} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
