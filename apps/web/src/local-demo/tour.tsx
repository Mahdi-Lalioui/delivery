import { Icon } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import { tourGroups, type TourLocale } from "./tour-stops";
import { TourTheme } from "./tour-theme";
import "./tour.css";

const copy = {
  fr: {
    badge: "Démo locale · Alger",
    title: "Visite guidée de Zaafran",
    start: "Ouvrir l’accueil",
    intro:
      "Commencez par l’accueil, puis suivez le parcours du client, du restaurant et de l’administration.",
    roles: {
      public: "Visite libre",
      customer: "Compte client",
      owner: "Compte restaurant",
      admin: "Compte administration",
    },
  },
  ar: {
    badge: "عرض محلي · الجزائر العاصمة",
    title: "جولة في زعفران",
    start: "افتح الصفحة الرئيسية",
    intro: "ابدأ بالصفحة الرئيسية، ثم تابع جولة الزبون والمطعم وإدارة المنصّة.",
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
      <header className="demo-tour-head demo-tour-intro">
        <div className="demo-tour-tools">
          <a href={`/${other}/dev/tour`} hrefLang={other} lang={other}>
            {language[other]}
          </a>
          <TourTheme locale={locale} />
        </div>
        <p className="eyebrow">{messages.badge}</p>
        <h1>{messages.title}</h1>
        <p>{messages.intro}</p>
        <a className="ui-button ui-button-primary ui-button-lg demo-tour-start" href={`/${locale}`}>
          {messages.start}
        </a>
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
