import type { Locale } from "@zaafran/i18n/locales";

// Dar Zellige before/after (D-036): the same screen and variant, captured before the creative
// pass and after it. Design build only (served from /[locale]/dev/gallery).
const screens = [
  "landing",
  "discover",
  "pickup",
  "restaurant",
  "sign-in",
  "account",
  "checkout",
  "payment",
  "confirmed",
  "tracking",
  "waiting",
  "pickup-tracking",
  "rating",
  "orders",
  "operations",
] as const;

function variantsFor(locale: Locale) {
  return locale === "ar" ? ["ar-390"] : ["fr-390", "fr-390-dark", "fr-1280"];
}

export function BeforeAfter({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { title: string; intro: string; before: string; after: string };
}) {
  return (
    <section className="before-after" aria-labelledby="before-after-title">
      <h2 id="before-after-title">{labels.title}</h2>
      <p>{labels.intro}</p>
      <ul className="before-after-list" role="list">
        {screens.flatMap((screen) =>
          variantsFor(locale).map((variant) => {
            const isWide = variant.endsWith("1280");
            const size = isWide ? { width: 640, height: 450 } : { width: 390, height: 844 };
            const name = `${screen}-${variant}`;
            return (
              <li key={name} data-wide={isWide}>
                <h3>
                  <code dir="ltr">{name}</code>
                </h3>
                <figure>
                  <img src={`/dev-gallery/before/${name}.webp`} alt="" loading="lazy" {...size} />
                  <figcaption>{labels.before}</figcaption>
                </figure>
                <figure>
                  <img src={`/dev-gallery/after/${name}.webp`} alt="" loading="lazy" {...size} />
                  <figcaption>{labels.after}</figcaption>
                </figure>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}
