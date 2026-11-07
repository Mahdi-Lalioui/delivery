import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getSignInPurpose } from "../auth/auth-flow";
import { SignInForm } from "./sign-in-form";
import { SiteShell } from "./site-shell";
import "./sign-in.css";

export interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface LocalizedSignInPageProps extends SignInPageProps {
  locale: Locale;
}

export async function signInMetadata({
  locale,
  searchParams,
}: LocalizedSignInPageProps): Promise<Metadata> {
  const purpose = getSignInPurpose((await searchParams).purpose);
  const translate = await getTranslations({ locale, namespace: "auth" });

  return {
    title: translate(purpose === "admin_sign_in" ? "adminTitle" : "title"),
    robots: { index: false, follow: false },
  };
}

export async function SignInPage({ locale, searchParams }: LocalizedSignInPageProps) {
  const purpose = getSignInPurpose((await searchParams).purpose);
  const subpath = purpose === "admin_sign_in" ? "/sign-in?purpose=admin" : "/sign-in";

  return (
    <SiteShell locale={locale} subpath={subpath}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ auth: getMessages(locale).auth }}
      >
        <SignInForm locale={locale} purpose={purpose} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
