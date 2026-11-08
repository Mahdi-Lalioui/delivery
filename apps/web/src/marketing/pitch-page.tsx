import { billingSettingsDefaults } from "@zaafran/contracts/billing";
import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../components/site-shell";
import "@zaafran/ui/ui.css";
import "./marketing.css";
import { PitchCalculator } from "./pitch-calculator";

const pointKeys = ["pointFlat", "pointDrivers", "pointArabic"] as const;

export async function pitchMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "marketingPitch" });
  return {
    title: translate("metaTitle", { brand: locale === "ar" ? brand.arabicName : brand.name }),
    description: translate("intro"),
    alternates: {
      languages: Object.fromEntries(
        publicLocales.map((item) => [localeDetails[item].tag, `/${item}/restaurants`]),
      ),
    },
  };
}

/** M8-2: the restaurant pitch page with the commission calculator and the signup call to action. */
export async function PitchPage({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingPitch" });
  return (
    <SiteShell locale={locale} subpath="/restaurants">
      <article className="pitch">
        <header className="pitch-hero">
          <h1>{translate("title")}</h1>
          <p className="intro">{translate("intro")}</p>
        </header>
        <ul className="pitch-points">
          {pointKeys.map((key) => (
            <li key={key}>
              <h2>{translate(`${key}Title`)}</h2>
              <p>{translate(`${key}Body`)}</p>
            </li>
          ))}
        </ul>
        <NextIntlClientProvider
          locale={localeDetails[locale].tag}
          messages={{ marketingPitch: getMessages(locale).marketingPitch }}
        >
          {/* BIL-01: the default fee; the live price comes from billing settings once lane A serves it. */}
          <PitchCalculator locale={locale} flatFeeDzd={billingSettingsDefaults.priceDzd} />
        </NextIntlClientProvider>
        <a className="pitch-cta" href={`/${locale}/merchant/apply`}>
          {translate("cta")}
        </a>
      </article>
    </SiteShell>
  );
}
