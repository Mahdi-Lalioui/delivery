import { merchantApplicationOutput } from "@zaafran/contracts/merchant";
import { menuItemInput } from "@zaafran/contracts/menu";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../../components/site-shell";
import { MenuItemScreen } from "./menu-item-screen";
import "./menu-item.css";
import "./menu-preview.css";

export interface MenuItemRouteProps {
  params: Promise<{ merchantId: string; categoryId: string }>;
}

export async function requireItemRouteIds({ params }: MenuItemRouteProps) {
  const { merchantId, categoryId } = await params;
  const merchant = merchantApplicationOutput.shape.merchantId.safeParse(merchantId);
  const category = menuItemInput.shape.categoryId.safeParse(categoryId);
  if (!merchant.success || !category.success) notFound();
  return { merchantId: merchant.data.toLowerCase(), categoryId: category.data.toLowerCase() };
}

export async function menuItemMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "menuItem" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MenuItemPage({
  merchantId,
  categoryId,
  locale,
}: {
  merchantId: string;
  categoryId: string;
  locale: Locale;
}) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/menu/${categoryId}/items`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{
          menuItem: getMessages(locale).menuItem,
          menuPrice: getMessages(locale).menuPrice,
          mediaPhoto: getMessages(locale).mediaPhoto,
          menuPreview: getMessages(locale).menuPreview,
        }}
      >
        <MenuItemScreen
          key={`${merchantId}/${categoryId}`}
          merchantId={merchantId}
          categoryId={categoryId}
          locale={locale}
        />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
