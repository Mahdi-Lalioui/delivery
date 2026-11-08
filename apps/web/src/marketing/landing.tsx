import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../components/site-shell";
import { CasbahHero } from "./casbah-hero";
import { CasbahPoster, heroSeed } from "./casbah-poster";
import "./marketing.css";

const stepKeys = ["stepChoose", "stepPay", "stepTrack"] as const;
const startId = "landing-start";

export async function landingMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return {
    title: locale === "ar" ? brand.arabicName : brand.name,
    description: translate("intro"),
    alternates: {
      languages: Object.fromEntries(
        publicLocales.map((item) => [localeDetails[item].tag, `/${item}`]),
      ),
    },
  };
}

/** M8-1 landing: the Casbah hero, how ordering works, and the restaurant pitch link. */
export async function Landing({ locale }: { locale: Locale }) {
  const [translate, translateMerchant] = await Promise.all([
    getTranslations({ locale, namespace: "marketingLanding" }),
    getTranslations({ locale, namespace: "merchant" }),
  ]);
  const name = locale === "ar" ? brand.arabicName : brand.name;
  return (
    <SiteShell locale={locale}>
      <article className="landing">
        <section className="landing-hero" aria-labelledby="landing-title">
          <CasbahHero
            seed={heroSeed}
            homeTargetId={startId}
            poster={<CasbahPoster label={translate("heroImage")} />}
          />
          <div className="landing-hero-copy">
            <h1 id="landing-title">{translate("title", { brand: name })}</h1>
            <p className="intro">{translate("intro")}</p>
            <div className="landing-actions">
              <a id={startId} className="pitch-cta" href={`/${locale}/sign-in`}>
                {translate("start")}
              </a>
            </div>
          </div>
        </section>
        <section aria-labelledby="landing-steps">
          <h2 id="landing-steps">{translate("stepsTitle")}</h2>
          <ol className="pitch-points">
            {stepKeys.map((key) => (
              <li key={key}>
                <h3>{translate(`${key}Title`)}</h3>
                <p>{translate(`${key}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="landing-restaurants" className="pitch-calculator">
          <h2 id="landing-restaurants">{translate("restaurantsTitle")}</h2>
          <p>{translate("restaurantsBody")}</p>
          <div className="landing-actions">
            <a href={`/${locale}/merchant/apply`}>{translateMerchant("startApplication")}</a>
            <a href={`/${locale}/restaurants`}>{translate("forRestaurants")}</a>
          </div>
        </section>
      </article>
    </SiteShell>
  );
}
