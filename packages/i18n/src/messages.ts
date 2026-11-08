import { IntlMessageFormat } from "intl-messageformat";

import { localeDetails, pseudoLocale, type Locale, type PublicLocale } from "./locales.ts";
import ar from "./messages/ar.json" with { type: "json" };
import en from "./messages/en.json" with { type: "json" };
import fr from "./messages/fr.json" with { type: "json" };
import { pseudoLocalize } from "./pseudo-localize.ts";

interface Catalog {
  [key: string]: string | Catalog;
}

const catalogs = { ar, en, fr } satisfies Record<PublicLocale, typeof en>;
export type Messages = typeof en;

function expandCatalog(catalog: Catalog): void {
  for (const [key, message] of Object.entries(catalog)) {
    if (typeof message === "string") catalog[key] = pseudoLocalize(message);
    else expandCatalog(message);
  }
}

const pseudoCatalog = structuredClone(en);
expandCatalog(pseudoCatalog);

export function getMessages(locale: Locale): Messages {
  return locale === pseudoLocale ? pseudoCatalog : catalogs[locale];
}

const itemCountFormatters = new Map<Locale, IntlMessageFormat>();

export function formatItemCount(count: number, locale: Locale): string {
  let formatter = itemCountFormatters.get(locale);
  if (!formatter) {
    const tag = new Intl.Locale(localeDetails[locale].tag, { numberingSystem: "latn" });
    formatter = new IntlMessageFormat(getMessages(locale).menu.itemCount, tag.toString());
    itemCountFormatters.set(locale, formatter);
  }
  return formatter
    .formatToParts<string>({ count })
    .map(({ value }) => value)
    .join("");
}
