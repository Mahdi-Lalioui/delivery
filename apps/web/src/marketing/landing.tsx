import { brand } from "@zaafran/config/brand";
import { isPublicLocale, localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Icon } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import { SiteShell } from "../components/site-shell";
import { isPreviewDemo } from "../preview-settings";
import { previewMessages } from "../preview/preview-messages";
import { CasbahHero } from "./casbah-hero";
import { CasbahPoster, heroSeed } from "./casbah-poster";
import "./marketing.css";

const steps = [
  { key: "stepChoose", icon: "plate" },
  { key: "stepPay", icon: "card" },
  { key: "stepTrack", icon: "bike" },
] as const;
const startId = "landing-start";

export async function landingMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return {
    title: locale === "ar" ? brand.arabicName : brand.name,
    description: translate("intro"),
    ...(isPreviewDemo(process.env) && { robots: { index: false, follow: false } }),
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
  const preview =
    isPublicLocale(locale) && isPreviewDemo(process.env) ? previewMessages[locale] : undefined;
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
            <p className="landing-intro">{translate("intro")}</p>
            <div className="landing-actions">
              {preview && (
                <a
                  className="ui-button ui-button-secondary ui-button-lg"
                  href={`/${locale}/preview`}
                >
                  <span>{preview.badge}</span>
                </a>
              )}
              <a
                id={startId}
                className="ui-button ui-button-primary ui-button-lg"
                href={`/${locale}/discover`}
              >
                <span>{translate("start")}</span>
              </a>
              <a className="ui-button ui-button-ghost ui-button-lg" href={`/${locale}/restaurants`}>
                <span>{translate("forRestaurantsShort")}</span>
              </a>
            </div>
          </div>
        </section>
        <section aria-labelledby="landing-steps" className="landing-section">
          <h2 id="landing-steps">{translate("stepsTitle")}</h2>
          <ol className="landing-steps">
            {steps.map(({ key, icon }, index) => (
              <li key={key}>
                <span className="landing-step-icon" aria-hidden="true">
                  <Icon name={icon} size={24} />
                </span>
                <span className="landing-step-number" aria-hidden="true">
                  {String(index + 1)}
                </span>
                <h3>{translate(`${key}Title`)}</h3>
                <p>{translate(`${key}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="landing-restaurants" className="landing-restaurants">
          <div>
            <h2 id="landing-restaurants">{translate("restaurantsTitle")}</h2>
            <p>{translate("restaurantsBody")}</p>
          </div>
          <div className="landing-actions">
            <a
              className="ui-button ui-button-primary ui-button-md"
              href={`/${locale}/merchant/apply`}
            >
              <span>{translateMerchant("startApplication")}</span>
            </a>
            <a
              className="ui-button ui-button-secondary ui-button-md"
              href={`/${locale}/restaurants`}
            >
              <span>{translate("forRestaurants")}</span>
            </a>
          </div>
        </section>
      </article>
    </SiteShell>
  );
}
