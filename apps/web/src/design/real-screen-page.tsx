import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { ToastProvider } from "@zaafran/ui";
import { NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import "../admin/billing/admin-billing.css";
import { SiteShell } from "../components/site-shell";
import { CustomerTabBar, type CustomerTab } from "../customer/tab-bar";
import "../retention/retention.css";
import { realScreens, type RealScreen as Screen } from "./real-screen-list";
import { RealScreen } from "./real-screens";

const tabs: Partial<Record<Screen, CustomerTab>> = {
  tracking: "orders",
  "tracking-waiting": "orders",
  "tracking-pickup": "orders",
  orders: "orders",
  rating: "orders",
};

function isScreen(value: string): value is Screen {
  return realScreens.some((screen) => screen === value);
}

export function RealScreenPage({ screen, locale }: { screen: string; locale: Locale }) {
  if (!isScreen(screen)) notFound();
  const messages = getMessages(locale);
  const tab = tabs[screen];
  return (
    <SiteShell locale={locale}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{
          checkout: messages.checkout,
          tracking: messages.tracking,
          retentionScheduling: messages.retentionScheduling,
          retentionRatings: messages.retentionRatings,
          retentionOrders: messages.retentionOrders,
        }}
      >
        <ToastProvider closeLabel={messages.merchantBilling.closeToast}>
          <RealScreen screen={screen} locale={locale} />
        </ToastProvider>
      </NextIntlClientProvider>
      {tab && <CustomerTabBar locale={locale} current={tab} />}
    </SiteShell>
  );
}
