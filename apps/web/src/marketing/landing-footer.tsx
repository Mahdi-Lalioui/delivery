import { brand } from "@zaafran/config/brand";
import type { Locale } from "@zaafran/i18n/locales";
import { Logo } from "@zaafran/ui";
import { getTranslations } from "next-intl/server";

/** The landing's real footer: brand, customer and restaurant links, legal and credits. */
export async function LandingFooter({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "marketingLanding" });
  const columns = [
    {
      title: translate("footerCustomers"),
      links: [
        [translate("footerDiscover"), "/discover"],
        [translate("footerOrders"), "/orders"],
        [translate("footerSignIn"), "/sign-in"],
      ],
    },
    {
      title: translate("footerRestaurants"),
      links: [
        [translate("footerOffer"), "/restaurants"],
        [translate("footerJoin"), "/merchant/apply"],
      ],
    },
    {
      title: translate("footerAbout"),
      links: [
        [translate("footerPrivacy"), "/account/privacy"],
        [translate("footerCredits"), "/credits"],
      ],
    },
  ] as const;
  return (
    <footer className="landing-footer">
      <div className="landing-footer-brand">
        <Logo height={44} name={locale === "ar" ? brand.arabicName : brand.name} />
        <p>{translate("footerTagline")}</p>
      </div>
      {columns.map((column) => (
        <nav key={column.title} aria-label={column.title}>
          <h2>{column.title}</h2>
          <ul role="list">
            {column.links.map(([label, path]) => (
              <li key={path}>
                <a href={`/${locale}${path}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <p className="landing-footer-rights">{translate("footerRights")}</p>
    </footer>
  );
}
