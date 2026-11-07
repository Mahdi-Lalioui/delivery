import { expect, test } from "vitest";
import {
  menuOptionGroupCreateInput,
  menuOptionGroupDetailOutput,
  menuOptionGroupPageOutput,
  menuOptionGroupPageQuery,
  menuOptionGroupUpdateInput,
  menuOptionGroupWriteOutput,
  readMenuOptionGroupCursor,
} from "../src/menu.ts";

const sessionId = "01932f18-3150-7c33-8a7a-53acfd343001";
const optionGroupId = "01932f18-3150-7c33-8a7a-53acfd343002";
const optionId = "01932f18-3150-7c33-8a7a-53acfd343003";
const secondId = "01932f18-3150-7c33-8a7a-53acfd343004";
const names = { ar: "صلصات", fr: "Sauces" };
const first = { names: { ar: "حارة" }, priceDeltaDzd: 25, isDefault: true, isAvailable: false };
const second = { names: { fr: "Douce" }, priceDeltaDzd: 0, isDefault: false, isAvailable: true };
const fields = { names, minimum: 0, maximum: 1, expectedRevision: 4 };
const optionGroup = {
  optionGroupId,
  names,
  minimum: 0,
  maximum: 1,
  options: [
    { ...first, optionId },
    { ...second, optionId: secondId },
  ],
};

test("[MER-10:contract] create has strict names, ordered options and revision without caller IDs", () => {
  const input = { ...fields, options: [first, second] };
  expect(menuOptionGroupCreateInput.parse(input)).toEqual(input);
  for (const invalid of [
    { ...input, optionGroupId },
    { ...input, options: [{ ...first, optionId }] },
    { ...input, expectedRevision: "4" },
    { ...input, minimum: 2 },
    { ...input, options: [first, { ...second, isDefault: true }] },
  ]) {
    expect(menuOptionGroupCreateInput.safeParse(invalid).success).toBe(false);
  }
});

test("[MER-10:contract] updates preserve existing option identities and reject UUID aliases", () => {
  const input = { ...fields, options: [{ ...first, optionId }, second] };
  expect(menuOptionGroupUpdateInput.parse(input)).toEqual(input);
  expect(
    menuOptionGroupUpdateInput.safeParse({
      ...input,
      options: [
        { ...first, optionId },
        { ...second, optionId: optionId.toUpperCase() },
      ],
    }).success,
  ).toBe(false);
  expect(
    menuOptionGroupUpdateInput.safeParse({
      ...input,
      options: [{ ...first, optionId: "fixture" }],
    }).success,
  ).toBe(false);
  expect(menuOptionGroupWriteOutput.parse({ revision: 5, optionGroup })).toEqual({
    revision: 5,
    optionGroup,
  });
});

test("[MER-10:contract] library pages carry names and stable IDs while details carry ordered options", () => {
  const nextCursor = "4~" + optionGroupId;
  const summary = { optionGroupId, names, minimum: 0, maximum: 1 };
  const page = { sessionId, revision: 4, optionGroups: [summary], nextCursor };
  expect(readMenuOptionGroupCursor(nextCursor)).toEqual({ revision: 4, optionGroupId });
  expect(menuOptionGroupPageQuery.parse({ cursor: nextCursor, limit: "5" })).toEqual({
    cursor: nextCursor,
    limit: 5,
  });
  expect(menuOptionGroupPageOutput.parse(page)).toEqual(page);
  expect(
    menuOptionGroupPageOutput.safeParse({ ...page, nextCursor: "3~" + optionGroupId }).success,
  ).toBe(false);
  expect(
    menuOptionGroupPageOutput.safeParse({ ...page, optionGroups: [optionGroup] }).success,
  ).toBe(false);
  const detail = { sessionId, revision: 4, optionGroup };
  expect(menuOptionGroupDetailOutput.parse(detail)).toEqual(detail);
  expect(menuOptionGroupDetailOutput.safeParse({ ...detail, sessionId: undefined }).success).toBe(
    false,
  );
});
