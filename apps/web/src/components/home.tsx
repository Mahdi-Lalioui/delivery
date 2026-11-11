import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomerWorker } from "../discovery/customer-worker";
import { DiscoveryLocationSelector } from "../discovery/discovery-location-selector";
import { DiscoveryFeed } from "../discovery/feed";
import { getFeedMessages } from "../discovery/feed-messages";
import { DiscoverySearch } from "../discovery/search";
import { CustomerTabBar } from "../customer/tab-bar";
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
  const [translateAuth, translateMerchant] = await Promise.all([
    getTranslations({ locale, namespace: "auth" }),
    getTranslations({ locale, namespace: "merchant" }),
  ]);
  const feed = getFeedMessages(locale);

  return (
    <SiteShell locale={locale} subpath="/discover">
      <CustomerWorker />
      <section className="discover-top" aria-labelledby="discover-title">
        <DiscoveryLocationSelector locale={locale} />
        <div className="discover-greeting">
          <h1 id="discover-title">{feed.greeting}</h1>
          <p>{feed.greetingIntro}</p>
        </div>
        <DiscoverySearch locale={locale} />
      </section>
      <DiscoveryFeed locale={locale} />
      <div className="home-actions">
        <a href={`/${locale}/sign-in`}>{translateAuth("title")}</a>
        <a href={`/${locale}/merchant/apply`}>{translateMerchant("startApplication")}</a>
      </div>
      <CustomerTabBar locale={locale} current="home" />
    </SiteShell>
  );
}
