import { merchantApplicationOutput } from "@zaafran/contracts/merchant";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { MenuCategoryScreen } from "./menu-category-screen";
import "./menu-category.css";

export interface MenuCategoryRouteProps {
  params: Promise<{ merchantId: string }>;
}

export async function requireMenuMerchantId({ params }: MenuCategoryRouteProps): Promise<string> {
  const { merchantId } = await params;
  const validId = merchantApplicationOutput.shape.merchantId.safeParse(merchantId);
  if (!validId.success) notFound();

  return validId.data.toLowerCase();
}

export async function menuCategoryMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "menuCategory" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MenuCategoryPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/menu`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ menuCategory: getMessages(locale).menuCategory }}
      >
        <MenuCategoryScreen key={merchantId} merchantId={merchantId} locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
