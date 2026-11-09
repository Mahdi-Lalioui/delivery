import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
  locale: Locale;
  subpath?:
    | "/dev/design"
    | "/discover"
    | "/sign-in"
    | "/sign-in?purpose=admin"
    | "/sign-in?continue=merchant-apply"
    | "/sign-in?continue=merchant-status"
    | "/sign-in?continue=staff-accept"
    | "/sign-in?continue=admin-review"
    | "/sign-in?continue=admin-moderation"
    | "/account/sessions"
    | "/account/privacy"
    | "/merchant"
    | "/merchant/apply"
    | "/staff/accept"
    | `/merchant/${string}/menu`
    | `/merchant/${string}/menu/options`
    | `/merchant/${string}/menu/${string}/items`
    | `/merchant/${string}/setup`
    | `/merchant/${string}/profile/photos`
    | `/merchant/${string}/hours`
    | `/merchant/${string}/staff`
    | `/merchant/${string}/billing`
    | `/merchant/${string}/reviews`
    | `/merchant/${string}/promotions`
    | `/merchant/${string}/share`
    | `/merchant/${string}/analytics`
    | "/restaurants"
    | `/restaurants/${string}`
    | `/orders/${string}/rating`
    | "/orders"
    | "/admin/merchant-applications"
    | "/admin/menu-items"
    | "/admin/billing"
    | "/admin/billing/settings"
    | "/admin/platform"
    | "/admin/dashboard";
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
          <a className="wordmark" href={`/${locale}`}>
            <span className="brand-mark" aria-hidden="true" />
            {locale === "ar" ? brand.arabicName : brand.name}
          </a>
          <nav className="languages" aria-label={translate("languages")}>
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
        </div>
      </header>
      <main id="content" className="container page" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
