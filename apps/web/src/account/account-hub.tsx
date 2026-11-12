import type { Locale } from "@zaafran/i18n/locales";
import { Icon, LogoMark, type IconName } from "@zaafran/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteShell } from "../components/site-shell";
import { CustomerTabBar } from "../customer/tab-bar";
import "./account-hub.css";

const entries: readonly {
  key: "orders" | "favourites" | "devices" | "privacy";
  icon: IconName;
  path: string;
}[] = [
  { key: "orders", icon: "receipt", path: "/orders" },
  { key: "favourites", icon: "heart", path: "/orders#orders-favourites" },
  { key: "devices", icon: "settings", path: "/account/sessions" },
  { key: "privacy", icon: "user", path: "/account/privacy" },
];

export async function accountHubMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "accountHub" });
  return { title: translate("title"), robots: { index: false } };
}

/** The Profile tab: every customer account page one tap away. */
export async function AccountHub({ locale }: { locale: Locale }) {
  const translate = await getTranslations({ locale, namespace: "accountHub" });
  return (
    <SiteShell locale={locale} subpath="/account">
      <section className="account-hub" aria-labelledby="account-title">
        <header className="account-hub-header">
          <LogoMark size={64} />
          <div>
            <h1 id="account-title">{translate("title")}</h1>
            <p>{translate("intro")}</p>
          </div>
        </header>
        <ul className="account-hub-list" role="list">
          {entries.map(({ key, icon, path }) => (
            <li key={key}>
              <a href={`/${locale}${path}`}>
                <span className="account-hub-icon" aria-hidden="true">
                  <Icon name={icon} size={22} />
                </span>
                <span className="account-hub-text">
                  <strong>{translate(key)}</strong>
                  <span>{translate(`${key}Body`)}</span>
                </span>
                <span className="account-hub-chevron" aria-hidden="true">
                  <Icon name="chevron" size={20} />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <a className="account-hub-pitch" href={`/${locale}/restaurants`}>
          <Icon name="store" size={24} />
          <span className="account-hub-text">
            <strong>{translate("restaurants")}</strong>
            <span>{translate("restaurantsBody")}</span>
          </span>
        </a>
        <a className="ui-button ui-button-secondary ui-button-lg" href={`/${locale}/sign-in`}>
          {translate("signIn")}
        </a>
      </section>
      <CustomerTabBar locale={locale} current="profile" />
    </SiteShell>
  );
}
