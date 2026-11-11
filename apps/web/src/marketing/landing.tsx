import { brand } from "@zaafran/config/brand";
import { isPublicLocale, localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Icon } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import { SiteShell } from "../components/site-shell";
import { isPreviewDemo } from "../preview-settings";
import { previewMessages } from "../preview/preview-messages";
import { getFeedCuisineLabel } from "../discovery/feed-messages";
import { LandingFooter } from "./landing-footer";
import "./landing.css";
import "./marketing.css";

const slides = [
  ["maqam", "/photos/algeria/algiers-maqam-echahid.webp"],
  ["casbah", "/photos/algeria/algiers-casbah.webp"],
  ["constantine", "/photos/algeria/constantine-bridge.webp"],
  ["ghardaia", "/photos/algeria/ghardaia-melika.webp"],
  ["sahara", "/photos/algeria/sahara-nomad.webp"],
] as const;
const cuisines = [
  ["algerian", "couscous"],
  ["grill", "grill-plate"],
  ["sandwiches", "karantika-sandwich"],
  ["pastry", "baklawa-tray"],
  ["bakery", "msemen-griddle"],
  ["pizza", "pizza"],
] as const;
const cities = [
  ["algiers", "algiers-casbah-market"],
  ["oran", "oran-santa-cruz"],
  ["constantine", "constantine-sidi-mcid"],
  ["tlemcen", "tlemcen-mansourah"],
  ["ghardaia", "ghardaia-market"],
  ["bejaia", "bejaia"],
] as const;
const steps = [
  { key: "stepChoose", icon: "search" },
  { key: "stepPay", icon: "card" },
  { key: "stepTrack", icon: "bike" },
] as const;

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

async function Hero({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  const name = locale === "ar" ? brand.arabicName : brand.name;
  const preview =
    isPublicLocale(locale) && isPreviewDemo(process.env) ? previewMessages[locale] : undefined;
  return (
    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-slides" role="img" aria-label={translate("heroImage")}>
        {slides.map(([key, src], index) => (
          <figure key={key} className="landing-slide">
            <img
              src={src}
              alt=""
              width="1600"
              height="1067"
              {...(index === 0 ? { fetchPriority: "high" } : { loading: "lazy" })}
            />
            <figcaption>{translate("heroCredit", { place: translate(`slide_${key}`) })}</figcaption>
          </figure>
        ))}
      </div>
      <div className="landing-hero-copy">
        <h1 id="landing-title">{translate("title", { brand: name })}</h1>
        <p className="landing-intro">{translate("intro")}</p>
        <div className="landing-actions">
          <a
            className="ui-button ui-button-primary ui-button-lg landing-start"
            href={`/${locale}/discover`}
          >
            <Icon name="pin" />
            <span>{translate("start")}</span>
          </a>
          {preview && (
            <a className="ui-button ui-button-secondary ui-button-lg" href={`/${locale}/preview`}>
              <span>{preview.badge}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

async function Cuisines({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return (
    <section className="landing-section" aria-labelledby="landing-cuisines">
      <h2 id="landing-cuisines">{translate("cuisinesTitle")}</h2>
      <ul className="landing-carousel" role="list">
        {cuisines.map(([cuisine, photo]) => (
          <li key={cuisine}>
            <a className="landing-photo-card" href={`/${locale}/discover?cuisine=${cuisine}`}>
              <img
                src={`/preview-catalog/${photo}.webp`}
                alt=""
                width="640"
                height="480"
                loading="lazy"
              />
              <span>{getFeedCuisineLabel(locale, cuisine)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Cities({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return (
    <section className="landing-section" aria-labelledby="landing-cities">
      <div className="landing-section-head">
        <h2 id="landing-cities">{translate("citiesTitle")}</h2>
        <p>{translate("citiesBody")}</p>
      </div>
      <ul className="landing-cities" role="list">
        {cities.map(([city, photo]) => (
          <li key={city}>
            <a className="landing-photo-card landing-city" href={`/${locale}/discover`}>
              <img
                src={`/photos/algeria/${photo}.webp`}
                alt=""
                width="800"
                height="600"
                loading="lazy"
              />
              <span>{translate(`city_${city}`)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function HowItWorks({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return (
    <section aria-labelledby="landing-steps" className="landing-section">
      <h2 id="landing-steps">{translate("stepsTitle")}</h2>
      <ol className="landing-steps">
        {steps.map(({ key, icon }, index) => (
          <li key={key}>
            <span className="landing-step-icon" aria-hidden="true">
              <Icon name={icon} size={28} />
              <span className="landing-step-number">{String(index + 1)}</span>
            </span>
            <h3>{translate(`${key}Title`)}</h3>
            <p>{translate(`${key}Body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function Pitch({ locale }: { locale: Locale }) {
  const [translate, translateMerchant] = await Promise.all([
    getTranslations({ locale, namespace: "marketingLanding" }),
    getTranslations({ locale, namespace: "merchant" }),
  ]);
  return (
    <section aria-labelledby="landing-restaurants" className="landing-pitch">
      <div className="landing-pitch-copy">
        <h2 id="landing-restaurants">{translate("restaurantsTitle")}</h2>
        <p>{translate("restaurantsBody")}</p>
        <div className="landing-actions">
          <a
            className="ui-button ui-button-lg landing-pitch-primary"
            href={`/${locale}/merchant/apply`}
          >
            <span>{translateMerchant("startApplication")}</span>
          </a>
          <a className="landing-pitch-link" href={`/${locale}/restaurants`}>
            {translate("forRestaurants")}
          </a>
        </div>
      </div>
      <dl className="landing-stats">
        <div>
          <dt>{translate("statCommission")}</dt>
          <dd dir="ltr">{translate("statCommissionValue")}</dd>
        </div>
        <div>
          <dt>{translate("statFlat")}</dt>
          <dd>
            <Icon name="calendar" size={32} />
          </dd>
        </div>
        <div>
          <dt>{translate("statDrivers")}</dt>
          <dd>
            <Icon name="bike" size={32} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** AWID landing: Algeria photography, cuisines, cities, how it works, the pitch, the footer. */
export function Landing({ locale }: { locale: Locale }) {
  return (
    <SiteShell locale={locale}>
      <article className="landing">
        <Hero locale={locale} />
        <Cuisines locale={locale} />
        <Cities locale={locale} />
        <HowItWorks locale={locale} />
        <Pitch locale={locale} />
      </article>
      <LandingFooter locale={locale} />
    </SiteShell>
  );
}
