import type { Locale } from "@zaafran/i18n/locales";

// Pilot and current captures, displayed only in the design gallery.
const screens = [
  "landing",
  "discover",
  "search",
  "restaurant",
  "dish",
  "cart",
  "checkout",
  "payment",
  "account",
  "confirmed",
  "tracking",
  "pickup-tracking",
  "rating",
  "orders",
  "sign-in",
  "merchant",
  "courier",
  "admin",
  "merchant-billing",
  "admin-billing",
  "billing-settings",
  "promotions",
  "reviews",
  "platform",
  "analytics",
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
      {screens.map((screen) => (
        <details key={screen} open={screen === "landing" || screen === "discover"}>
          <summary>
            <code dir="ltr">{screen}</code>
          </summary>
          <ul className="before-after-list" role="list">
            {variantsFor(locale).map((variant) => {
              const isWide = variant.endsWith("1280");
              const wideHeight = screen === "dish" || screen === "cart" ? 422 : 450;
              const size = isWide
                ? { width: 640, height: wideHeight }
                : { width: 390, height: 844 };
              const name = `${screen}-${variant}`;
              return (
                <li key={name} data-wide={isWide}>
                  <h3>
                    <code dir="ltr">{name}</code>
                  </h3>
                  <figure>
                    <img
                      src={`/dev-gallery/design-v2/before/${name}.webp`}
                      alt=""
                      loading="lazy"
                      {...size}
                    />
                    <figcaption>{labels.before}</figcaption>
                  </figure>
                  <figure>
                    <img
                      src={`/dev-gallery/design-v2/after/${name}.webp`}
                      alt=""
                      loading="lazy"
                      {...size}
                    />
                    <figcaption>{labels.after}</figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </section>
  );
}
