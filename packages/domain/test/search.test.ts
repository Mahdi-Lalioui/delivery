import fc from "fast-check";
import { assertDomainProperty } from "./property.ts";
import { expect, test } from "vitest";
import { normalize, skeleton } from "../src/search.ts";

test("[SRCH-01] normalizes accents, compatibility characters and mixed whitespace", () => {
  expect(normalize(" ＣＡＦÉ\u00a0ﬁG\tCafe\u0301\nİSTANBUL ")).toBe("cafe fig cafe istanbul");
  expect(normalize("  م'حاجب، CAFÉ! Й  ")).toBe("م'حاجب، cafe! й");
  expect(normalize("\r\n\t\u00a0")).toBe("");
});

test("[SRCH-01] folds Arabic variants and both local digit ranges", () => {
  expect(normalize("أ إ آ ٱ ة ى ؤ ئ ﻻ")).toBe("ا ا ا ا ه ي و ي لا");
  expect(normalize("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789 0123456789");

  const tashkeel = Array.from({ length: 21 }, (_, index) => String.fromCodePoint(0x064b + index));
  expect(normalize(`سـ${tashkeel.join("")}ل\u0670ام`)).toBe("سلام");
});

test("[SRCH-01] handles characters made adjacent by removing tatweel", () => {
  expect(normalize("aـ\u0301")).toBe("a");
  expect(normalize("\u1100ـ\u1161")).toBe("가");
});

test("[SRCH-01] Unicode normalization is idempotent @property", () => {
  const mixedScripts = fc.string({
    unit: fc.constantFrom(
      "A",
      "É",
      "İ",
      "\u0301",
      "شَ",
      "ـ",
      "ى",
      "ؤ",
      "۵",
      "٢",
      "،",
      "\u1100",
      "\u1161",
      "\u00a0",
      "\t",
      "🧪",
    ),
    maxLength: 50,
  });

  assertDomainProperty(
    fc.property(fc.oneof(fc.string({ unit: "binary", maxLength: 50 }), mixedScripts), (input) => {
      const normalized = normalize(input);
      expect(normalize(normalized)).toBe(normalized);
    }),
  );
});

test("[SRCH-02] matches the SPEC cross-script examples", () => {
  for (const spelling of ["chawarma", "shawarma", "شاورما", "chawerma"]) {
    expect(skeleton(spelling), spelling).toBe("CRM");
  }
  for (const spelling of ["mhadjeb", "m'hadjeb", "محاجب", "m7adjeb"]) {
    expect(skeleton(spelling), spelling).toBe("MHJB");
  }
  expect(skeleton("tacos")).toBe("TKS");
  expect(skeleton("طاكوس")).toBe("TKS");
  expect(skeleton("couscous")).toBe("KSKS");
  expect(skeleton("كسكس")).toBe("KSKS");
});

test("[SRCH-02] maps every consonant class in both scripts", () => {
  const allClasses = "BTJHXDZRSCGFQKLMN";
  expect(skeleton("ب تطث ج ح خ دض ذزظ ر سص ش غ ف قڨ ك ل م ن")).toBe(allClasses);
  expect(skeleton("p th dj 7 kh d z r ce ch gh v qa ca l m n")).toBe(allClasses);
  expect(skeleton("ب٥٨٩")).toBe("BXGQ");
});

test("[SRCH-02] distinguishes contextual g/c and gives digraphs priority", () => {
  expect(skeleton("général")).toBe("JNRL");
  expect(skeleton("gato")).toBe("QT");
  expect(skeleton("cité")).toBe("ST");
  expect(skeleton("café")).toBe("KF");
  expect(skeleton("ghi")).toBe("G");
  expect(skeleton("thé")).toBe("T");
  expect(skeleton("shisha")).toBe("C");
});

test("[SRCH-02] drops final Arabic heh and ignores unmapped characters", () => {
  expect(skeleton("هدهد، ماه! حليب")).toBe("HDHDMHLB");
  expect(skeleton("🧪 Ω 猫\u0000")).toBe("");
  expect(skeleton("ا و ي ع ء 123 ?!")).toBe("");
});
