import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DiscoveryLocationSelector } from "../discovery/discovery-location-selector";
import { SiteShell } from "./site-shell";

export function homeMetadata(locale: Locale): Metadata {
  return {
    title: locale === "ar" ? brand.arabicName : brand.name,
    alternates: {
      languages: Object.fromEntries(
        publicLocales.map((item) => [localeDetails[item].tag, `/${item}`]),
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

  return (
    <SiteShell locale={locale}>
      <section className="hero">
        <p className="eyebrow">{translate("eyebrow")}</p>
        <h1>{locale === "ar" ? brand.arabicName : brand.name}</h1>
        <p className="intro">{translate("description")}</p>
        <DiscoveryLocationSelector locale={locale} />
        <div className="home-actions">
          <a href={`/${locale}/sign-in`}>{translateAuth("title")}</a>
          <a href={`/${locale}/merchant/apply`}>{translateMerchant("startApplication")}</a>
        </div>
      </section>
    </SiteShell>
  );
}
