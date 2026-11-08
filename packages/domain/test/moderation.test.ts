import fc from "fast-check";
import { expect, test } from "vitest";
import { findProhibitedGoods } from "../src/moderation.ts";
import { assertDomainProperty } from "./property.ts";

test("[ADM-04] flags alcohol, tobacco, medicines and gambling in French and English", () => {
  expect(findProhibitedGoods(["Bière blonde 33 cl"])).toEqual(["alcohol"]);
  expect(findProhibitedGoods(["Red wine", "Whisky"])).toEqual(["alcohol"]);
  expect(findProhibitedGoods(["Paquet de cigarettes"])).toEqual(["tobacco"]);
  expect(findProhibitedGoods(["Chicha menthe"])).toEqual(["tobacco"]);
  expect(findProhibitedGoods(["Doliprane", "Paracétamol 500 mg"])).toEqual(["medicine"]);
  expect(findProhibitedGoods(["Ticket de loto"])).toEqual(["gambling"]);
  expect(findProhibitedGoods(["Pari sportif offert"])).toEqual(["gambling"]);
});

test("[ADM-04] flags Arabic terms through prefixes, diacritics and tatweel", () => {
  expect(findProhibitedGoods(["البيرة الباردة"])).toEqual(["alcohol"]);
  expect(findProhibitedGoods(["وسجـائر"])).toEqual(["tobacco"]);
  expect(findProhibitedGoods(["دَوَاء للسعال"])).toEqual(["medicine"]);
  expect(findProhibitedGoods(["يانصيب"])).toEqual(["gambling"]);
});

test("[ADM-04] flags Algerian Arabizi spellings", () => {
  expect(findProhibitedGoods(["biera fraiche"])).toEqual(["alcohol"]);
  expect(findProhibitedGoods(["garro marlboro"])).toEqual(["tobacco"]);
  expect(findProhibitedGoods(["dwa ta3 l'kohha"])).toEqual(["medicine"]);
});

test("[ADM-04] reports every matched category once, in a stable order", () => {
  const texts = ["Vodka", "Casino night", "cigarettes", "Vin rouge", "Pharmacie"];
  expect(findProhibitedGoods(texts)).toEqual(["alcohol", "tobacco", "medicine", "gambling"]);
});

test("[ADM-04] matches whole words so ordinary dishes stay clean", () => {
  const dishes = [
    "Salade vinaigrette",
    "Cigares au miel",
    "Pâtes à la crème",
    "Pizza Paris",
    "Thé à la menthe",
    "Gâteau traditionnel",
    "Chorba frik",
    "شوربة فريك",
    "Pain maison",
    "Brochettes de poulet",
    "",
  ];
  expect(findProhibitedGoods(dishes)).toEqual([]);
});

const safeWords = fc.constantFrom<string>(
  "couscous",
  "poulet",
  "salade",
  "vinaigrette",
  "cigares",
  "miel",
  "chorba",
  "كسكس",
  "دجاج",
  "pizza",
  "menthe",
  "paris",
);
const prohibitedTerms = [
  ["bière", "alcohol"],
  ["whisky", "alcohol"],
  ["نبيذ", "alcohol"],
  ["tabac", "tobacco"],
  ["سيجارة", "tobacco"],
  ["antibiotique", "medicine"],
  ["صيدلية", "medicine"],
  ["poker", "gambling"],
  ["قمار", "gambling"],
] as const;
const prohibited = fc.constantFrom(...prohibitedTerms);

test("[ADM-04] never flags text made only of ordinary dish words @property", () => {
  assertDomainProperty(
    fc.property(fc.array(safeWords, { maxLength: 8 }), (words) => {
      expect(findProhibitedGoods([words.join(" ")])).toEqual([]);
    }),
  );
});

test("[ADM-04] flags a prohibited word anywhere, in any letter case @property", () => {
  assertDomainProperty(
    fc.property(
      fc.record({
        words: fc.array(safeWords, { maxLength: 6 }),
        entry: prohibited,
        position: fc.nat(),
        isUpper: fc.boolean(),
      }),
      ({ words, entry: [term, category], position, isUpper }) => {
        const spliced = [...words];
        spliced.splice(position % (words.length + 1), 0, term);
        const text = spliced.join(" ");
        expect(findProhibitedGoods([isUpper ? text.toUpperCase() : text])).toEqual([category]);
      },
    ),
  );
});
