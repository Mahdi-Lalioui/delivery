import { brand } from "@zaafran/config/brand";
import { localeDetails, publicLocales, type Locale } from "@zaafran/i18n/locales";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
  locale: Locale;
  subpath?:
    | "/dev/design"
    | "/sign-in"
    | "/sign-in?purpose=admin"
    | "/sign-in?continue=merchant-apply"
    | "/sign-in?continue=merchant-status"
    | "/sign-in?continue=admin-review"
    | "/account/sessions"
    | "/merchant"
    | "/merchant/apply"
    | `/merchant/${string}/menu`
    | `/merchant/${string}/menu/options`
    | `/merchant/${string}/menu/${string}/items`
    | `/merchant/${string}/setup`
    | "/admin/merchant-applications";
}

export async function SiteShell({ children, locale, subpath }: SiteShellProps) {
  const translate = await getTranslations({ locale, namespace: "shell" });
  const isAdmin =
    subpath === "/admin/merchant-applications" || subpath === "/sign-in?continue=admin-review";
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
