export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u0640|[\u064b-\u065f]|\u0670/gu, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Script=Latin}[\p{Mark}&&\p{Script_Extensions=Latin}]*/gv, (cluster) =>
      cluster.normalize("NFD").replace(/\p{Mark}/gu, ""),
    )
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ة/gu, "ه")
    .replace(/[ىئ]/gu, "ي")
    .replace(/ؤ/gu, "و")
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\s+/gu, " ")
    .trim();
}

const consonantClasses = [
  ["B", "ب b p"],
  ["T", "ت ط ث t th"],
  ["J", "ج j dj ge gi"],
  ["H", "ح ه h 7"],
  ["X", "خ kh 5"],
  ["D", "د ض d"],
  ["Z", "ذ ز ظ z"],
  ["R", "ر r"],
  ["S", "س ص s ce ci"],
  ["C", "ش ch sh"],
  ["G", "غ gh 8"],
  ["F", "ف f v"],
  ["Q", "ق ڨ q 9 ga go gu"],
  ["K", "ك k ca co cu"],
  ["L", "ل l"],
  ["M", "م m"],
  ["N", "ن n"],
] as const;

const consonants = new Map(
  consonantClasses.flatMap(([sound, spellings]) =>
    spellings.split(" ").map((spelling) => [spelling, sound] as const),
  ),
);

export function skeleton(text: string): string {
  const normalized = normalize(text).replace(/ه(?![\p{Letter}\p{Mark}\p{Number}])/gu, "");
  // Match digraphs before single letters. Contextual c/g consumes the vowel that is dropped.
  const spellings =
    normalized.match(/th|dj|kh|ch|sh|gh|[cg][aeiou]|[\p{Letter}\p{Number}]/gu) ?? [];

  return spellings
    .map((spelling) => consonants.get(spelling) ?? "")
    .join("")
    .replace(/([A-Z])\1+/gu, "$1");
}
