import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { ToastProvider } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../../components/site-shell";
import "../billing/admin-billing.css";
import "../../retention/retention.css";
import { LaneBGallery } from "./lane-b-gallery";
import { SystemShowcase } from "../../design/system-showcase";
import "../../design/system-showcase.css";

export const galleryMetadata = { robots: { index: false, follow: false } };

export function GalleryPage({
  locale,
  initialScreen,
}: {
  locale: Locale;
  initialScreen?: string | string[] | undefined;
}) {
  const messages = getMessages(locale);
  return (
    <SiteShell locale={locale}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{
          designGallery: messages.designGallery,
          adminBilling: messages.adminBilling,
          merchantBilling: messages.merchantBilling,
          adminBillingSettings: messages.adminBillingSettings,
          retentionPromotions: messages.retentionPromotions,
          retentionRatings: messages.retentionRatings,
          retentionScheduling: messages.retentionScheduling,
          checkout: messages.checkout,
          retentionRecipient: messages.retentionRecipient,
          adminPlatform: messages.adminPlatform,
          retentionOrders: messages.retentionOrders,
          retentionAnalytics: messages.retentionAnalytics,
        }}
      >
        <ToastProvider closeLabel={messages.merchantBilling.closeToast}>
          <section className="billing-page" aria-labelledby="gallery-title">
            <header className="ui-page-header">
              <div className="ui-page-header-text">
                <h1 id="gallery-title" className="ui-page-title">
                  {messages.designGallery.title}
                </h1>
                <p className="ui-page-intro">{messages.designGallery.intro}</p>
              </div>
            </header>
            <SystemShowcase copy={messages.designGallery} />
            <LaneBGallery
              locale={locale}
              initialScreen={initialScreen}
              labels={{
                screen: messages.designGallery.screens,
                state: messages.designGallery.state,
              }}
            />
          </section>
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
