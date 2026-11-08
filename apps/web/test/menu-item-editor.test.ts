import { expect, test } from "vitest";
import {
  buildInlinePriceCommand,
  makeMenuItemDraft,
  parseMenuItemDraft,
  prepareMenuItemAttempt,
} from "../src/menu-item/item-editor";

const categoryId = "019d6abc-1234-7234-8234-123456789002";
const optionGroupIds = [
  "019d6abc-1234-7234-8234-123456789005",
  "019d6abc-1234-7234-8234-123456789003",
];
const item = {
  itemId: "019d6abc-1234-7234-8234-123456789004",
  categoryId,
  names: { fr: "Grillade" },
  descriptions: { ar: "وجبة مشوية" },
  priceDzd: 1200,
  extraPrepMinutes: 15,
  tags: ["spicy"] as const,
  optionGroupIds,
  photoId: null,
  moderationStatus: "unreviewed",
  isAvailable: true,
  soldOutUntil: null,
} as const;
const draft = {
  ...makeMenuItemDraft({ ...item, tags: [...item.tags] }),
  price: "١٢٠٠",
  prep: "۱۵",
};

test("[MER-09:items] builds bilingual item commands with whole dinars and no media placeholder", () => {
  expect(parseMenuItemDraft({ draft, categoryId, expectedRevision: 9 })).toEqual({
    kind: "valid",
    input: {
      expectedRevision: 9,
      categoryId,
      names: item.names,
      descriptions: item.descriptions,
      priceDzd: 1200,
      photoId: null,
      tags: ["spicy"],
      extraPrepMinutes: 15,
      optionGroupIds,
    },
  });
});

test("[MER-10] preserves existing attached option groups in their stored order after an edit", () => {
  const edited = { ...draft, nameFr: "  Nouvelle grillade  " };
  const result = parseMenuItemDraft({ draft: edited, categoryId, expectedRevision: 9 });
  expect(result).toMatchObject({
    kind: "valid",
    input: { names: { fr: "Nouvelle grillade" }, optionGroupIds },
  });
  expect(makeMenuItemDraft().optionGroupIds).toEqual([]);
});

test("[MER-09:items] rejects missing Arabic/French translations, fractions, and out-of-range prep times", () => {
  for (const [changes, field] of [
    [{ nameFr: "", nameEn: "English only" }, "names"],
    [{ descriptionAr: "", descriptionEn: "English only" }, "descriptions"],
    [{ price: "150.5" }, "price"],
    [{ price: "" }, "price"],
    [{ price: "-1" }, "price"],
    [{ prep: "121" }, "prep"],
  ] as const) {
    expect(
      parseMenuItemDraft({ draft: { ...draft, ...changes }, categoryId, expectedRevision: 9 }),
    ).toEqual({ kind: "invalid", field });
  }
});

test("[MER-09:items] retries keep the same key only for the same action, item and revision", () => {
  const command = { kind: "archive", itemId: item.itemId, input: { expectedRevision: 9 } } as const;
  const attempt = prepareMenuItemAttempt(command);
  expect(prepareMenuItemAttempt(command, attempt)).toBe(attempt);
  expect(
    prepareMenuItemAttempt({ ...command, input: { expectedRevision: 10 } }, attempt).idempotencyKey,
  ).not.toBe(attempt.idempotencyKey);
  expect(
    prepareMenuItemAttempt({ ...command, kind: "duplicate" }, attempt).idempotencyKey,
  ).not.toBe(attempt.idempotencyKey);
});

test("[MER-09:inline-price] updates only the persisted price and preserves ordered attachments and media", () => {
  const photoId = "019d6abc-1234-7234-8234-123456789006";
  const saved = {
    ...item,
    photoId,
    names: { ar: "مشاوي", fr: "Grillade", en: "Grill" },
    descriptions: { ar: "وجبة مشوية", fr: "Plat grillé", en: "Grilled dish" },
    tags: [...item.tags],
  };
  expect(buildInlinePriceCommand({ item: saved, value: "۱٬۳۵۰", expectedRevision: 9 })).toEqual({
    kind: "invalid",
  });
  expect(buildInlinePriceCommand({ item: saved, value: "۱۳۵۰", expectedRevision: 9 })).toEqual({
    kind: "ready",
    command: {
      kind: "edit",
      itemId: saved.itemId,
      input: {
        categoryId,
        expectedRevision: 9,
        names: saved.names,
        descriptions: saved.descriptions,
        priceDzd: 1350,
        photoId,
        tags: saved.tags,
        extraPrepMinutes: saved.extraPrepMinutes,
        optionGroupIds,
      },
    },
  });
});

test("[MER-09:inline-price] accepts only bounded whole dinars and identifies an unchanged price", () => {
  const saved = { ...item, tags: [...item.tags] };
  for (const value of ["-1", "1.5", "2147483648", "", "1e3"]) {
    expect(buildInlinePriceCommand({ item: saved, value, expectedRevision: 9 })).toEqual({
      kind: "invalid",
    });
  }
  expect(buildInlinePriceCommand({ item: saved, value: "١٢٠٠", expectedRevision: 9 })).toEqual({
    kind: "unchanged",
  });
  expect(buildInlinePriceCommand({ item: saved, value: "0", expectedRevision: 9 })).toMatchObject({
    kind: "ready",
    command: { input: { priceDzd: 0 } },
  });
});
