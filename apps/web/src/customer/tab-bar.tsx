import type { Locale } from "@zaafran/i18n/locales";
import { Icon, type IconName } from "@zaafran/ui";
import "./tab-bar.css";

const labels = {
  en: { label: "Main", home: "Home", search: "Search", orders: "Orders", profile: "Profile" },
  fr: {
    label: "Principal",
    home: "Accueil",
    search: "Recherche",
    orders: "Commandes",
    profile: "Profil",
  },
  ar: { label: "الرئيسية", home: "الرئيسية", search: "بحث", orders: "طلباتي", profile: "حسابي" },
} as const;

export type CustomerTab = "home" | "search" | "orders" | "profile";

const tabs: readonly { tab: CustomerTab; icon: IconName; path: string }[] = [
  { tab: "home", icon: "home", path: "/discover" },
  { tab: "search", icon: "search", path: "/discover?search=open" },
  { tab: "orders", icon: "receipt", path: "/orders" },
  { tab: "profile", icon: "user", path: "/account/sessions" },
];

/** Customer app bottom tab bar (phones); a slim top navigation row on wide screens. */
export function CustomerTabBar({ locale, current }: { locale: Locale; current: CustomerTab }) {
  const text = locale === "ar" ? labels.ar : locale === "fr" ? labels.fr : labels.en;
  return (
    <nav className="customer-tabs" aria-label={text.label}>
      <ul role="list" data-current={current}>
        {tabs.map(({ tab, icon, path }) => (
          <li key={tab}>
            <a href={`/${locale}${path}`} aria-current={tab === current ? "page" : undefined}>
              <Icon name={icon} size={24} />
              <span>{text[tab]}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
