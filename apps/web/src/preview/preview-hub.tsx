import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type PublicLocale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { Icon, type IconName } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import type { Metadata } from "next";
import { CasbahHero } from "../marketing/casbah-hero";
import { heroSeed } from "../marketing/casbah-poster";
import "../marketing/marketing.css";
import { previewMessages } from "./preview-messages";
import "./preview.css";

export const previewMetadata = { robots: { index: false, follow: false } } satisfies Metadata;

const discoveryTargetId = "preview-discover";
const experiences = [
  { role: "customer", icon: "plate", path: "/discover" },
  { role: "restaurant", icon: "receipt", path: "/dev/gallery?screen=merchant-billing" },
  { role: "admin", icon: "settings", path: "/dev/gallery?screen=admin-billing" },
  { role: "motion", icon: "bike", path: "/dev/moments" },
] as const satisfies ReadonlyArray<{ role: string; icon: IconName; path: string }>;

function PreviewMasthead({ locale }: { locale: PublicLocale }) {
  const { shell } = getMessages(locale);
  return (
    <>
      <a className="skip-link" href="#content">
        {shell.skip}
      </a>
      <header className="masthead">
        <div className="container masthead-inner">
          <a className="wordmark" href={`/${locale}/preview`}>
            <span className="brand-mark" aria-hidden="true" />
            {locale === "ar" ? brand.arabicName : brand.name}
          </a>
          <nav className="languages" aria-label={shell.languages}>
            {publicLocales.map((language) => {
              const { name, tag, direction } = localeDetails[language];
              return (
                <a
                  key={language}
                  href={`/${language}/preview`}
                  lang={tag}
                  hrefLang={tag}
                  dir={direction}
                  aria-current={language === locale ? "page" : undefined}
                >
                  {name}
                </a>
              );
            })}
          </nav>
        </div>
      </header>
    </>
  );
}

function PreviewHero({ locale }: { locale: PublicLocale }) {
  const messages = previewMessages[locale];
  return (
    <section className="preview-hero" aria-labelledby="preview-title">
      <div className="preview-hero-copy">
        <p className="preview-eyebrow">{messages.badge}</p>
        <h1 id="preview-title">{messages.title}</h1>
        <p className="preview-intro">{messages.description}</p>
        <a
          id={discoveryTargetId}
          className="ui-button ui-button-primary ui-button-lg preview-primary"
          href={`/${locale}/discover`}
        >
          <span>{messages.customer.action}</span>
          <Icon name="chevron" />
        </a>
      </div>
      <figure className="preview-scene">
        <CasbahHero
          seed={heroSeed}
          homeTargetId={discoveryTargetId}
          poster={
            <img
              className="casbah-poster preview-scene-poster"
              src="/preview-catalog/casbah.webp"
              alt={getMessages(locale).marketingLanding.heroImage}
              width={1600}
              height={1000}
              fetchPriority="high"
            />
          }
        />
        <figcaption>
          <span>{messages.city}</span>
          <span className="preview-scene-kind">{messages.scene}</span>
        </figcaption>
      </figure>
    </section>
  );
}

function PreviewExperiences({ locale }: { locale: PublicLocale }) {
  const messages = previewMessages[locale];
  return (
    <section className="preview-experiences" aria-labelledby="preview-experiences">
      <header>
        <p className="preview-eyebrow">{messages.experiences}</p>
        <h2 id="preview-experiences">{messages.choose}</h2>
      </header>
      <ul className="preview-cards">
        {experiences.map(({ role, icon, path }) => {
          const { title, kind, description } = messages[role];
          return (
            <li key={role}>
              <a
                href={`/${locale}${path}`}
                className="preview-card"
                aria-labelledby={`preview-${role}-title`}
                aria-describedby={`preview-${role}-description`}
              >
                <div className="preview-card-top">
                  <span className="preview-card-icon">
                    <Icon name={icon} size={24} />
                  </span>
                  <Icon name="chevron" />
                </div>
                <div>
                  <p className="preview-card-kind">{kind}</p>
                  <h3 id={`preview-${role}-title`}>{title}</h3>
                </div>
                <p id={`preview-${role}-description`}>{description}</p>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PreviewHub({ locale }: { locale: PublicLocale }) {
  const messages = previewMessages[locale];
  return (
    <>
      <PreviewMasthead locale={locale} />
      <main id="content" className="container preview-hub" tabIndex={-1}>
        <PreviewHero locale={locale} />
        <PreviewExperiences locale={locale} />
        <footer className="preview-footer">
          <p>{messages.fixtureNote}</p>
          <a href={`/${locale}/dev/design`}>{messages.guide}</a>
        </footer>
      </main>
    </>
  );
}
