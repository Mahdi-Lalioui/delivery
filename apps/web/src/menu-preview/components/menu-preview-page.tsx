import { merchantApplicationOutput } from "@zaafran/contracts/merchant";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { MenuPreviewScreen } from "./menu-preview-screen";
import "./menu-preview.css";

export interface MenuPreviewRouteProps {
  params: Promise<{ merchantId: string }>;
}

export async function requirePreviewMerchantId({ params }: MenuPreviewRouteProps): Promise<string> {
  const { merchantId } = await params;
  const id = merchantApplicationOutput.shape.merchantId.safeParse(merchantId);
  if (!id.success) notFound();

  return id.data.toLowerCase();
}

export async function menuPreviewMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "menuPreview" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MenuPreviewPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/menu/preview`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ menuPreview: getMessages(locale).menuPreview }}
      >
        <MenuPreviewScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
