import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import "@zaafran/ui/ui.css";
import { CustomerTabBar } from "../customer/tab-bar";
import { SiteShell } from "../components/site-shell";
import "../admin/admin-merchant.css";
import "../admin/billing/admin-billing.css";
import { MyOrders } from "./my-orders";
import "./retention.css";

// Its own server module: a page ships the client code of everything its module imports,
// so Orders must not share a file with the rating, promotions or analytics pages (NFR-02).

export async function ordersMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "retentionOrders" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function MyOrdersPage({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath="/orders">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ retentionOrders: getMessages(locale).retentionOrders }}
      >
        <MyOrders locale={locale} />
      </NextIntlClientProvider>
      {/* Orders is a tab: keep the tab bar, as Home, Search and Profile do. */}
      <CustomerTabBar locale={locale} current="orders" />
    </SiteShell>
  );
}
