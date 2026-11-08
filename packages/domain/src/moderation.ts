import { normalize } from "./search.ts";

/** Goods that may not be sold online under Law 18-05 Art. 3 (SPEC §17.3), in report order. */
export const prohibitedCategories = ["alcohol", "tobacco", "medicine", "gambling"] as const;
export type ProhibitedCategory = (typeof prohibitedCategories)[number];

// Whole words or phrases in fr/en, Arabic and Algerian Arabizi. Entries are normalized like input.
const keywords: Record<ProhibitedCategory, readonly string[]> = {
  alcohol: [
    "alcool",
    "alcohol",
    "biere",
    "beer",
    "vin",
    "wine",
    "whisky",
    "whiskey",
    "vodka",
    "rhum",
    "rum",
    "gin",
    "pastis",
    "champagne",
    "liqueur",
    "cognac",
    "tequila",
    "anisette",
    "biera",
    "birra",
    "chrab",
    "خمر",
    "خمور",
    "نبيذ",
    "بيرة",
    "ويسكي",
    "فودكا",
    "كحول",
    "مشروبات كحولية",
  ],
  tobacco: [
    "tabac",
    "tobacco",
    "cigarette",
    "cigarillo",
    "chicha",
    "shisha",
    "narguile",
    "nargile",
    "hookah",
    "vape",
    "snus",
    "chemma",
    "garro",
    "garou",
    "doukhan",
    "تبغ",
    "دخان",
    "سجائر",
    "سيجارة",
    "سيجار",
    "شيشة",
    "نرجيلة",
    "شمة",
  ],
  medicine: [
    "medicament",
    "medicine",
    "medication",
    "pharmacie",
    "pharmacy",
    "antibiotique",
    "antibiotic",
    "paracetamol",
    "doliprane",
    "ibuprofene",
    "ibuprofen",
    "aspirine",
    "aspirin",
    "dwa",
    "دواء",
    "ادوية",
    "صيدلية",
    "مضاد حيوي",
    "باراسيتامول",
  ],
  gambling: [
    "casino",
    "poker",
    "loto",
    "loterie",
    "lottery",
    "roulette",
    "tombola",
    "pari sportif",
    "sports betting",
    "betting",
    "pmu",
    "tierce",
    "قمار",
    "رهان",
    "رهانات",
    "يانصيب",
    "كازينو",
  ],
};

// Longest first, so "وال" is removed before "و".
const arabicPrefixes = ["وال", "بال", "فال", "كال", "لل", "ال", "و"];

/** Folds Arabic clitic prefixes and Latin plural "s" so a word matches its dictionary form. */
function canonicalWord(word: string): string {
  const prefix = arabicPrefixes.find((candidate) => word.startsWith(candidate));
  if (prefix && word.length - prefix.length >= 2) return word.slice(prefix.length);
  if (/^[a-z0-9]{4,}s$/u.test(word)) return word.slice(0, -1);
  return word;
}

/** Canonical words joined and padded with spaces, so phrases match on word boundaries. */
function canonicalText(text: string): string {
  const words = normalize(text).match(/[\p{Letter}\p{Number}]+/gu) ?? [];
  return ` ${words.map(canonicalWord).join(" ")} `;
}

const patterns = prohibitedCategories.map(
  (category) => [category, keywords[category].map(canonicalText)] as const,
);

/** Returns each prohibited category found in the texts, once, in a stable order. */
export function findProhibitedGoods(texts: readonly string[]): ProhibitedCategory[] {
  const haystack = texts.map(canonicalText).join("\n");
  return patterns
    .filter(([, phrases]) => phrases.some((phrase) => haystack.includes(phrase)))
    .map(([category]) => category);
}
