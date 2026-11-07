import { defaultLocale, isPublicLocale, pseudoLocale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(({ locale: requested }) => {
  const locale =
    isPublicLocale(requested) || requested === pseudoLocale ? requested : defaultLocale;

  return { locale, messages: getMessages(locale), timeZone: "Africa/Algiers" };
});
