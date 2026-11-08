import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { ToastProvider } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import { NextIntlClientProvider } from "next-intl";
import { SiteShell } from "../../components/site-shell";
import "../billing/admin-billing.css";
import { LaneBGallery } from "./lane-b-gallery";

export const galleryMetadata = { robots: { index: false, follow: false } };

export function GalleryPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  return (
    <SiteShell locale={locale}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{
          adminBilling: messages.adminBilling,
          merchantBilling: messages.merchantBilling,
        }}
      >
        <ToastProvider closeLabel={messages.merchantBilling.closeToast}>
          <LaneBGallery
            locale={locale}
            labels={{
              screen: messages.marketingMoments.title,
              state: messages.adminBilling.status,
            }}
          />
        </ToastProvider>
      </NextIntlClientProvider>
    </SiteShell>
  );
}
