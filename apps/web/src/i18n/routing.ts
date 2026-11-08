import { defaultLocale, publicLocales } from "@zaafran/i18n/locales";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: publicLocales,
  defaultLocale,
  localePrefix: "always",
  alternateLinks: false,
});
