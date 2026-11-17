import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { DiscoveryExperience } from "../discovery/discovery-experience";
import { CustomerWorker } from "../discovery/customer-worker";
import { InstallPrompt } from "../customer/install-prompt";
import { CustomerTabBar } from "../customer/tab-bar";
import { LandingFooter } from "../marketing/landing-footer";
import { SiteShell } from "./site-shell";

export function homeMetadata(locale: Locale, subpath = ""): Metadata {
  return {
    title: locale === "ar" ? brand.arabicName : brand.name,
    manifest: `/pwa/${locale}/app.webmanifest`,
    icons: { apple: "/pwa/icon-192.png" },
    alternates: {
      languages: Object.fromEntries(
        publicLocales.map((item) => [localeDetails[item].tag, `/${item}${subpath}`]),
      ),
    },
  };
}

export async function Home({ locale }: { locale: Locale }) {
  // Awaited here (an async server component) so the page renders in one pass.
  const footer = await LandingFooter({ locale });
  return (
    <SiteShell locale={locale} subpath="/discover">
      <CustomerWorker />
      <DiscoveryExperience locale={locale} />
      {/* A real footer instead of two bare links: the page ends on brand, links and credits. */}
      {footer}
      <InstallPrompt locale={locale} />
      <CustomerTabBar locale={locale} current="home" />
    </SiteShell>
  );
}
