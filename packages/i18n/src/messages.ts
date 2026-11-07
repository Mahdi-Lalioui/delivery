import { pseudoLocale, type Locale, type PublicLocale } from "./locales.ts";
import ar from "./messages/ar.json" with { type: "json" };
import en from "./messages/en.json" with { type: "json" };
import fr from "./messages/fr.json" with { type: "json" };

interface Catalog {
  [key: string]: string | Catalog;
}

const catalogs = { ar, en, fr } satisfies Record<PublicLocale, typeof en>;
export type Messages = typeof en;

const accents: Readonly<Record<string, string>> = {
  a: "à",
  c: "ç",
  e: "é",
  i: "ï",
  n: "ñ",
  o: "ô",
  u: "ü",
};

function expandText(text: string): string {
  let remainingVowels = text.match(/[aeiou]/gi)?.length ?? 0;
  let remainingExpansion = Math.max(0, Math.round(text.length * 0.4) - 2);
  const accented = text.replace(/[aceinou]/gi, (letter) => {
    const replacement = accents[letter.toLowerCase()] ?? letter;
    const accentedLetter =
      letter === letter.toUpperCase() ? replacement.toUpperCase() : replacement;
    if (!/[aeiou]/i.test(letter)) return accentedLetter;

    const extra = Math.round(remainingExpansion / remainingVowels);
    remainingExpansion -= extra;
    remainingVowels -= 1;
    return accentedLetter.repeat(extra + 1);
  });
  return `[${accented}]`;
}

function expandCatalog(catalog: Catalog): void {
  for (const [key, message] of Object.entries(catalog)) {
    if (typeof message === "string") catalog[key] = expandText(message);
    else expandCatalog(message);
  }
}

const pseudoCatalog = structuredClone(en);
expandCatalog(pseudoCatalog);

export function getMessages(locale: Locale): Messages {
  return locale === pseudoLocale ? pseudoCatalog : catalogs[locale];
}
