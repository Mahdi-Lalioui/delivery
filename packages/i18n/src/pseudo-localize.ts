import {
  isLiteralElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  parse,
  type LiteralElement,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";

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
  return text.replace(/[aceinou]/gi, (letter) => {
    const replacement = accents[letter.toLowerCase()] ?? letter;
    const accentedLetter =
      letter === letter.toUpperCase() ? replacement.toUpperCase() : replacement;
    if (!/[aeiou]/i.test(letter)) return accentedLetter;

    const extra = Math.round(remainingExpansion / remainingVowels);
    remainingExpansion -= extra;
    remainingVowels -= 1;
    return accentedLetter.repeat(extra + 1);
  });
}

function collectLiterals(elements: MessageFormatElement[]): LiteralElement[] {
  return elements.flatMap((element) => {
    if (isLiteralElement(element)) return [element];
    if (isPluralElement(element) || isSelectElement(element)) {
      return Object.values(element.options).flatMap((option) => collectLiterals(option.value));
    }
    if (isTagElement(element)) return collectLiterals(element.children);
    return [];
  });
}

export function pseudoLocalize(message: string): string {
  const literals = collectLiterals(parse(message, { captureLocation: true }));
  let expanded = message;

  // Work from right to left so earlier source offsets stay valid.
  for (const { location } of literals.toReversed()) {
    if (!location) continue;
    const { start, end } = location;
    const text = expandText(message.slice(start.offset, end.offset));
    expanded = expanded.slice(0, start.offset) + text + expanded.slice(end.offset);
  }

  return `[${expanded}]`;
}
