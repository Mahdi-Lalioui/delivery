import type { Locale } from "@zaafran/i18n/locales";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "./site-shell";
import "./design-guide.css";

const swatches = ["background", "surface", "ink", "saffron"] as const;

const statuses = [
  { key: "information", style: "info", symbol: "ℹ" },
  { key: "success", style: "success", symbol: "✓" },
  { key: "warning", style: "warning", symbol: "!" },
  { key: "danger", style: "danger", symbol: "×" },
] as const;

export async function designGuideMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "guide" });

  return {
    title: translate("title"),
    robots: { index: false, follow: false },
  };
}

export async function DesignGuide({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "guide" });

  return (
    <SiteShell locale={locale} subpath="/dev/design">
      <section className="hero guide-hero">
        <div>
          <p className="eyebrow">{translate("eyebrow")}</p>
          <h1>{translate("title")}</h1>
          <p className="intro">{translate("introduction")}</p>
        </div>
        <div className="guide-stamp">
          <span className="brand-mark" aria-hidden="true" />
          <p className="micro">{translate("system")}</p>
          <p>{translate("preview")}</p>
        </div>
      </section>

      <section id="palette" className="guide-section">
        <h2>{translate("palette")}</h2>
        <p>{translate("paletteDescription")}</p>
        <ul className="swatches" role="list">
          {swatches.map((swatch) => (
            <li className="specimen" key={swatch}>
              <div className={`swatch swatch-${swatch}`} aria-hidden="true" />
              <span>{translate(swatch)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="typography" className="guide-section">
        <h2>{translate("typography")}</h2>
        <div className="type-samples">
          <div className="type-sample specimen">
            <p className="micro">{translate("display")}</p>
            <p className="display-sample">{translate("displaySample")}</p>
          </div>
          <div className="type-sample specimen">
            <p className="micro">{translate("body")}</p>
            <p className="intro">{translate("bodySample")}</p>
          </div>
        </div>
      </section>

      <section className="guide-section">
        <h2>{translate("controls")}</h2>
        <div className="controls specimen">
          <div className="control-row">
            <a className="control control-primary" href="#palette">
              {translate("primary")}
            </a>
            <a className="control control-secondary" href="#typography">
              {translate("secondary")}
            </a>
            <button className="control" type="button" disabled>
              {translate("disabled")}
            </button>
          </div>
          <label className="example-field">
            {translate("field")}
            <input type="text" placeholder={translate("placeholder")} />
          </label>
          <ul className="status-row" role="list">
            {statuses.map(({ key, style, symbol }) => (
              <li className={`status status-${style}`} key={key}>
                <span aria-hidden="true">{symbol}</span>
                {translate(key)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SiteShell>
  );
}
