import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { MerchantProfilePhotosScreen } from "./merchant-profile-photos-screen";
import "./merchant-profile-photos.css";

export async function merchantProfilePhotosMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "merchantProfilePhotos" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export function MerchantProfilePhotosPage({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  const { merchantProfilePhotos, mediaPhoto } = getMessages(locale);
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/profile/photos`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ merchantProfilePhotos, mediaPhoto }}
      >
        <MerchantProfilePhotosScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
