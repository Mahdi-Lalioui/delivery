import { Icon } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import { tourGroups, type TourLocale } from "./tour-stops";
import { TourTheme } from "./tour-theme";
import "./tour.css";

const copy = {
  fr: {
    badge: "Démo locale · Alger",
    title: "Une table à Alger",
    intro: "Suivez un repas, de sa découverte à la gestion du restaurant et de la plateforme.",
    roles: {
      public: "Visite libre",
      customer: "Compte client",
      owner: "Compte restaurant",
      admin: "Compte administration",
    },
  },
  ar: {
    badge: "عرض محلي · الجزائر العاصمة",
    title: "مائدة في الجزائر العاصمة",
    intro: "تتبّع رحلة الوجبة من اكتشافها إلى إدارة المطعم والمنصّة.",
    roles: {
      public: "جولة مفتوحة",
      customer: "حساب الزبون",
      owner: "حساب المطعم",
      admin: "حساب الإدارة",
    },
  },
};
const language = { ar: "العربية", fr: "Français" };

export function DemoTour({ locale }: { locale: TourLocale }) {
  const messages = copy[locale];
  const other = locale === "fr" ? "ar" : "fr";
  return (
    <main className="container demo-tour">
      <header className="demo-tour-head">
        <div className="demo-tour-tools">
          <a href={`/${other}/dev/tour`} hrefLang={other} lang={other}>
            {language[other]}
          </a>
          <TourTheme locale={locale} />
        </div>
        <p className="eyebrow">{messages.badge}</p>
        <h1>{messages.title}</h1>
        <p>{messages.intro}</p>
      </header>
      {tourGroups.map((group, index) => (
        <section
          key={group.role}
          className="demo-tour-chapter"
          aria-labelledby={`tour-${group.role}`}
        >
          <header>
            <bdi className="demo-tour-index">{String(index + 1).padStart(2, "0")}</bdi>
            <div>
              <h2 id={`tour-${group.role}`}>{group[locale]}</h2>
              <p>{messages.roles[group.role]}</p>
            </div>
          </header>
          <ul role="list" className="demo-tour-grid">
            {group.stops.map((stop) => (
              <li key={stop.path}>
                <a href={`/${locale}${stop.path}`} data-tour-link data-tour-role={group.role}>
                  <div>
                    <h3>{stop[locale][0]}</h3>
                    <p>{stop[locale][1]}</p>
                  </div>
                  <Icon name="chevron" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
