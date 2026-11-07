import { expect, test } from "vitest";
import {
  menuCategoryCommandInput,
  menuCategoryOrderOutput,
  menuCategoryPageOutput,
  menuCategoryPageQuery,
  menuCategoryWriteOutput,
  readMenuCategoryCursor,
} from "../src/menu.ts";

const categoryId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const input = { names: { ar: "الأطباق" }, availability: null };
const category = { categoryId, position: 2, ...input };
const cursor = "7~2~" + categoryId;

test("[MER-09:contract] requires the prior menu revision on category writes", () => {
  const command = { ...input, expectedRevision: 7 };
  expect(menuCategoryCommandInput.parse(command)).toEqual(command);
  for (const invalid of [
    input,
    { ...command, expectedRevision: "7" },
    { ...command, expectedRevision: -1 },
    { ...command, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...command, categoryId },
  ]) {
    expect(menuCategoryCommandInput.safeParse(invalid).success).toBe(false);
  }
  expect(menuCategoryWriteOutput.parse({ revision: 8, category })).toEqual({
    revision: 8,
    category,
  });
  expect(
    menuCategoryWriteOutput.safeParse({ revision: 8, category: { ...category, position: -1 } })
      .success,
  ).toBe(false);
  expect(menuCategoryOrderOutput.parse({ revision: 8, categoryIds: [categoryId] })).toEqual({
    revision: 8,
    categoryIds: [categoryId],
  });
});

test("[MER-09:contract] binds category pages to an authorized session and revision", () => {
  const response = { sessionId, revision: 7, categories: [category], nextCursor: cursor };
  expect(menuCategoryPageOutput.parse(response)).toEqual(response);
  expect(menuCategoryPageOutput.safeParse({ ...response, sessionId: undefined }).success).toBe(
    false,
  );
  expect(menuCategoryPageOutput.safeParse({ ...response, nextCursor: "opaque" }).success).toBe(
    false,
  );
  expect(
    menuCategoryPageOutput.safeParse({ ...response, nextCursor: "6~2~" + categoryId }).success,
  ).toBe(false);
  expect(menuCategoryPageQuery.parse({ limit: "1", cursor })).toEqual({ limit: 1, cursor });
  expect(menuCategoryPageQuery.parse({})).toEqual({ limit: 50 });
  expect(readMenuCategoryCursor(cursor)).toEqual({ revision: 7, position: 2, categoryId });
  for (const invalid of [
    "7~2~unknown",
    "7~-1~" + categoryId,
    "7~2147483648~" + categoryId,
    "9007199254740992~2~" + categoryId,
    "7~2~" + categoryId + "~extra",
  ]) {
    expect(menuCategoryPageQuery.safeParse({ cursor: invalid }).success).toBe(false);
  }
});
