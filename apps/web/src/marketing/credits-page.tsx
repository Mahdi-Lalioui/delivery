import type { Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../components/site-shell";
import { LandingFooter } from "./landing-footer";
import { photoCredits } from "./photo-credits";
import "./landing.css";

export async function creditsMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return { title: translate("creditsTitle") };
}

/** Attribution for every photo (CC BY and BY-SA require it). */
export async function CreditsPage({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  return (
    <SiteShell locale={locale} subpath="/credits">
      <section className="landing-credits" aria-labelledby="credits-title">
        <h1 id="credits-title">{translate("creditsTitle")}</h1>
        <p>{translate("creditsIntro")}</p>
        <ul role="list">
          {photoCredits.map((credit) => (
            <li key={credit.file}>
              <img src={credit.file} alt="" width="160" height="120" loading="lazy" />
              <div dir="ltr">
                <strong>
                  {credit.title.replace(/\.(jpe?g|png|webp)$/iu, "").replaceAll("_", " ")}
                </strong>
                <span>{credit.author}</span>
                {credit.file.startsWith("/preview-catalog/") && (
                  <span dir="auto">{translate("creditsFoodEdits")}</span>
                )}
                <span>
                  {credit.licenceUrl === null ? (
                    credit.licence
                  ) : (
                    <a href={credit.licenceUrl} rel="license noreferrer">
                      {credit.licence}
                    </a>
                  )}
                  <a className="landing-credits-source" href={credit.source} rel="noreferrer">
                    {translate("creditsSource")}
                  </a>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <LandingFooter locale={locale} />
    </SiteShell>
  );
}
