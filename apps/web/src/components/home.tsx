import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomerWorker } from "../discovery/customer-worker";
import { DiscoveryLocationSelector } from "../discovery/discovery-location-selector";
import { DiscoveryFeed } from "../discovery/feed";
import { DiscoverySearch } from "../discovery/search";
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
  const [translate, translateAuth, translateMerchant] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "auth" }),
    getTranslations({ locale, namespace: "merchant" }),
  ]);

  const demo = process.env.NODE_ENV === "development" && process.env.ZAAFRAN_LOCAL_DEMO === "1";
  return (
    <SiteShell locale={locale} subpath="/discover">
      <CustomerWorker />
      <section className="hero" data-demo-discover={demo || undefined}>
        <p className="eyebrow">{translate("eyebrow")}</p>
        <h1>{locale === "ar" ? brand.arabicName : brand.name}</h1>
        <p className="intro">{translate("description")}</p>
        <DiscoveryLocationSelector locale={locale} />
        <DiscoverySearch locale={locale} />
        <div className="home-actions">
          <a href={`/${locale}/sign-in`}>{translateAuth("title")}</a>
          <a href={`/${locale}/merchant/apply`}>{translateMerchant("startApplication")}</a>
        </div>
      </section>
      <DiscoveryFeed locale={locale} />
    </SiteShell>
  );
}
