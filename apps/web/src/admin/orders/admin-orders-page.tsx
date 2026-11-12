import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../../components/site-shell";
import { AdminOrdersScreen } from "./admin-orders-screen";
import "@zaafran/ui/ui.css";
import "./admin-orders.css";

export function adminOrdersMetadata(locale: Locale): Metadata {
  return { title: getMessages(locale).adminOrders.title, robots: { index: false, follow: false } };
}

export function AdminOrdersPage({ locale }: { locale: Locale }) {
  const { adminOrders, retentionOrders } = getMessages(locale);
  return (
    <SiteShell locale={locale} subpath="/admin/orders">
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ adminOrders, retentionOrders }}
      >
        <AdminOrdersScreen locale={locale} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
