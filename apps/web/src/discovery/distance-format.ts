import type { Locale } from "@zaafran/i18n/locales";

function numberLocale(locale: Locale): string {
  return locale === "ar" ? "ar-DZ-u-nu-latn" : locale;
}

/**
 * A straight-line distance from the commune centre, rounded to what that guess is worth:
 * 100 m steps under a kilometre, tenths up to 10 km, whole kilometres beyond.
 */
export function formatApproxDistance(meters: number, locale: Locale): string {
  if (meters < 1000) {
    const rounded = Math.max(100, Math.round(meters / 100) * 100);
    return new Intl.NumberFormat(numberLocale(locale), { style: "unit", unit: "meter" }).format(
      rounded,
    );
  }
  const km = meters / 1000;
  return new Intl.NumberFormat(numberLocale(locale), {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
}
