import { isPublicLocale, pseudoLocale, type Locale } from "@zaafran/i18n/locales";
import { notFound } from "next/navigation";

export interface LatinPageProps {
  params: Promise<{ locale: string }>;
}

export async function requireLatinLocale({
  params,
}: LatinPageProps): Promise<Exclude<Locale, "ar">> {
  const { locale } = await params;

  if (isPublicLocale(locale) && locale !== "ar") return locale;
  if (locale === pseudoLocale && process.env.ZAAFRAN_DESIGN_ENABLED === "1") return locale;

  notFound();
}
