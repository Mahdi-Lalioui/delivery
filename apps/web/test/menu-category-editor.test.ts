import { expect, test } from "vitest";
import {
  moveMenuCategory,
  parseCategoryDraft,
  prepareCategoryAttempt,
} from "../src/menu-category/category-editor";

const draft = { ar: "", fr: "  Dîner  ", en: "", from: "21:00", to: "03:00" };

test("[MER-09] accepts an overnight availability window and omits empty translations", () => {
  expect(parseCategoryDraft(draft, 8)).toEqual({
    kind: "valid",
    input: {
      names: { fr: "Dîner" },
      availability: { from: "21:00", to: "03:00" },
      expectedRevision: 8,
    },
  });
  expect(parseCategoryDraft({ ...draft, from: "", to: "" }, 8)).toEqual({
    kind: "valid",
    input: { names: { fr: "Dîner" }, availability: null, expectedRevision: 8 },
  });
});

test("[MER-09] rejects missing Arabic and French names and incomplete, invalid or equal times", () => {
  expect(parseCategoryDraft({ ...draft, fr: "", en: "Dinner" }, 8)).toEqual({
    kind: "invalid",
    field: "names",
  });
  for (const to of ["", "24:01", "21:00"]) {
    expect(parseCategoryDraft({ ...draft, to }, 8)).toEqual({
      kind: "invalid",
      field: "availability",
    });
  }
});

test("[MER-09] pointer and keyboard movement use the same complete reorder list", () => {
  const original = ["breakfast", "lunch", "dinner", "dessert"];
  expect(moveMenuCategory(original, "dinner", "lunch")).toEqual([
    "breakfast",
    "dinner",
    "lunch",
    "dessert",
  ]);
  expect(moveMenuCategory(original, "breakfast", "dessert")).toEqual([
    "lunch",
    "dinner",
    "dessert",
    "breakfast",
  ]);
  expect(moveMenuCategory(original, "breakfast", "breakfast")).toBeUndefined();
  expect(moveMenuCategory(original, "lunch", "missing")).toBeUndefined();
  expect(original).toEqual(["breakfast", "lunch", "dinner", "dessert"]);
});

test("[MER-09] retries keep the same key only for identical category command and revision", () => {
  const first = parseCategoryDraft(draft, 8);
  const changed = parseCategoryDraft(draft, 9);
  if (first.kind !== "valid" || changed.kind !== "valid") throw new Error("Invalid test category.");

  const command = { kind: "category", input: first.input } as const;
  const attempt = prepareCategoryAttempt(command);
  expect(prepareCategoryAttempt(command, attempt)).toBe(attempt);
  expect(
    prepareCategoryAttempt({ kind: "category", input: changed.input }, attempt).idempotencyKey,
  ).not.toBe(attempt.idempotencyKey);
});
