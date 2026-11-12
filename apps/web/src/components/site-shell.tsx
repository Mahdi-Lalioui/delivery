import { brand } from "@zaafran/config/brand";
import {
  isPublicLocale,
  localeDetails,
  publicLocales,
  type Locale,
  type PublicLocale,
} from "@zaafran/i18n/locales";
import { getTranslations } from "next-intl/server";
import { Icon, Logo } from "@zaafran/ui";
import "@zaafran/ui/ui.css";
import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
  locale: Locale;
  subpath?:
    | "/dev/design"
    | "/discover"
    | "/checkout"
    | "/credits"
    | "/sign-in"
    | "/sign-in?purpose=admin"
    | "/sign-in?continue=merchant-apply"
    | "/sign-in?continue=merchant-status"
    | "/sign-in?continue=staff-accept"
    | "/sign-in?continue=courier"
    | "/sign-in?continue=admin-orders"
    | "/sign-in?continue=admin-review"
    | "/sign-in?continue=admin-moderation"
    | "/account"
    | "/account/sessions"
    | "/account/privacy"
    | "/merchant"
    | "/merchant/apply"
    | "/staff/accept"
    | "/courier"
    | `/merchant/${string}/menu`
    | `/merchant/${string}/menu/options`
    | `/merchant/${string}/menu/${string}/items`
    | `/merchant/${string}/setup`
    | `/merchant/${string}/profile/photos`
    | `/merchant/${string}/hours`
    | `/merchant/${string}/delivery-settings`
    | `/merchant/${string}/board`
    | `/merchant/${string}/staff`
    | `/merchant/${string}/billing`
    | `/merchant/${string}/reviews`
    | `/merchant/${string}/promotions`
    | `/merchant/${string}/share`
    | `/merchant/${string}/analytics`
    | "/restaurants"
    | `/restaurants/${string}`
    | `/orders/${string}/rating`
    | `/orders/${string}`
    | "/orders"
    | "/admin/merchant-applications"
    | "/admin/menu-items"
    | "/admin/billing"
    | "/admin/billing/settings"
    | "/admin/platform"
    | "/admin/dashboard"
    | "/admin/orders";
}

const adminSubpaths: ReadonlySet<string> = new Set([
  "/admin/merchant-applications",
  "/admin/menu-items",
  "/admin/billing",
  "/admin/billing/settings",
  "/admin/platform",
  "/admin/dashboard",
  "/sign-in?continue=admin-review",
  "/sign-in?continue=admin-moderation",
]);

function LanguageLinks({
  locale,
  languages,
  subpath,
  label,
}: {
  locale: Locale;
  languages: readonly PublicLocale[];
  subpath: string | undefined;
  label: string;
}) {
  return (
    <nav className="languages" aria-label={label}>
      {languages.map((language) => {
        const { name, tag, direction } = localeDetails[language];
        return (
          <a
            key={language}
            href={`/${language}${subpath ?? ""}`}
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
  );
}

export async function SiteShell({ children, locale, subpath }: SiteShellProps) {
  const translate = await getTranslations({ locale, namespace: "shell" });
  const isAdmin = subpath !== undefined && adminSubpaths.has(subpath);
  const languages = isAdmin ? publicLocales.filter((language) => language !== "ar") : publicLocales;

  return (
    <>
      <a className="skip-link" href="#content">
        {translate("skip")}
      </a>
      <header className="masthead">
        <div className="container masthead-inner">
          <a
            className="wordmark"
            href={`/${locale}`}
            aria-label={locale === "ar" ? brand.arabicName : brand.name}
          >
            <Logo height={48} name={brand.name} />
          </a>
          <LanguageLinks
            locale={locale}
            languages={languages}
            subpath={subpath}
            label={translate("languages")}
          />
          <details className="language-menu">
            <summary aria-label={translate("languages")}>
              <Icon name="globe" size={20} />
              <span>{localeDetails[isPublicLocale(locale) ? locale : "en"].name}</span>
            </summary>
            <LanguageLinks
              locale={locale}
              languages={languages}
              subpath={subpath}
              label={translate("languages")}
            />
          </details>
        </div>
      </header>
      <main id="content" className="container page" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
