import type { Locale } from "@zaafran/i18n/locales";
import type { Ticket } from "./board-http";

export function dishName(names: Ticket["lines"][number]["names"], locale: Locale) {
  return (
    names[locale === "ar" || locale === "en" ? locale : "fr"] ?? names.fr ?? names.ar ?? names.en
  );
}
