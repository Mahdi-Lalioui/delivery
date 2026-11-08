import { expect, test } from "vitest";
import {
  menuItemArchiveOutput,
  menuItemAvailabilityInput,
  menuItemAvailabilityOutput,
  menuItemCommandInput,
  menuItemPageOutput,
  menuItemPageQuery,
  menuItemRevisionInput,
  menuItemWriteOutput,
  readMenuItemCursor,
} from "../src/menu.ts";

const merchantSessionId = "01932f18-3150-7c33-8a7a-53acfd343001";
const categoryId = "01932f18-3150-7c33-8a7a-53acfd343002";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343003";
const now = "2026-11-07T12:00:00.000Z";
const item = {
  categoryId,
  names: { ar: "طبق تجريبي", fr: "Plat fictif" },
  descriptions: { fr: "Description fictive" },
  priceDzd: 750,
  photoId: null,
  tags: ["spicy"],
  extraPrepMinutes: 5,
  optionGroupIds: [],
};
const itemView = {
  ...item,
  itemId,
  isAvailable: false,
  soldOutUntil: now,
  moderationStatus: "unreviewed",
};

test("[MER-09:contract] revision-bound item edits keep lifecycle and moderation out of input", () => {
  const command = { ...item, expectedRevision: 2 };
  expect(menuItemCommandInput.parse(command)).toEqual(command);
  expect(menuItemCommandInput.parse({ ...command, removePhoto: true })).toEqual({
    ...command,
    removePhoto: true,
  });
  for (const invalid of [
    { ...command, removePhoto: true, photoId: itemId },
    { ...item },
    { ...command, itemId },
    { ...command, archivedAt: now },
    { ...command, moderationStatus: "approved" },
    { ...command, isAvailable: true },
    { ...command, priceDzd: 100.5 },
  ]) {
    expect(menuItemCommandInput.safeParse(invalid).success).toBe(false);
  }
  expect(menuItemRevisionInput.parse({ expectedRevision: 2 })).toEqual({ expectedRevision: 2 });
  expect(menuItemRevisionInput.safeParse({ expectedRevision: 2, itemId }).success).toBe(false);
});

test("[MER-09:contract] separates supported availability commands and archives", () => {
  for (const availability of ["available", "end_of_day", "indefinite"]) {
    const input = { expectedRevision: 2, availability };
    expect(menuItemAvailabilityInput.parse(input)).toEqual(input);
  }
  for (const input of [
    { expectedRevision: 2, availability: now },
    { expectedRevision: 2, availability: "end_of_day", soldOutUntil: now },
    { expectedRevision: -1, availability: "available" },
  ]) {
    expect(menuItemAvailabilityInput.safeParse(input).success).toBe(false);
  }
  const sale = { itemId, revision: 3, isAvailable: false, soldOutUntil: now };
  expect(menuItemAvailabilityOutput.parse(sale)).toEqual(sale);
  expect(menuItemAvailabilityOutput.safeParse({ ...sale, priceDzd: 750 }).success).toBe(false);
  expect(menuItemArchiveOutput.parse({ revision: 3, itemId, archivedAt: now })).toEqual({
    revision: 3,
    itemId,
    archivedAt: now,
  });
});

test("[MER-09:contract] exposes current availability and a revision-bound page without archived items", () => {
  const nextCursor = "3~" + itemId;
  expect(readMenuItemCursor(nextCursor)).toEqual({ revision: 3, itemId });
  expect(menuItemPageQuery.parse({ categoryId, cursor: nextCursor, limit: "25" })).toEqual({
    categoryId,
    cursor: nextCursor,
    limit: 25,
  });
  expect(menuItemPageQuery.safeParse({ cursor: nextCursor }).success).toBe(false);
  expect(
    menuItemPageQuery.safeParse({ categoryId, cursor: "9007199254740992~" + itemId }).success,
  ).toBe(false);

  const page = { sessionId: merchantSessionId, revision: 3, items: [itemView], nextCursor };
  expect(menuItemPageOutput.parse(page)).toEqual(page);
  const withContext = {
    ...page,
    context: { restaurantName: "Cuisine fictive", categoryNames: { ar: "أطباق", fr: "Plats" } },
  };
  expect(menuItemPageOutput.parse(withContext)).toEqual(withContext);
  expect(
    menuItemPageOutput.safeParse({
      ...page,
      context: { restaurantName: "Cuisine fictive", categoryNames: { en: "Only English" } },
    }).success,
  ).toBe(false);
  expect(menuItemPageOutput.safeParse({ ...page, nextCursor: "2~" + itemId }).success).toBe(false);
  expect(
    menuItemPageOutput.safeParse({ ...page, items: [{ ...itemView, archivedAt: now }] }).success,
  ).toBe(false);
  expect(menuItemWriteOutput.parse({ revision: 3, item: itemView })).toEqual({
    revision: 3,
    item: itemView,
  });
  expect(
    menuItemWriteOutput.safeParse({ revision: 3, item: { ...itemView, isAvailable: true } })
      .success,
  ).toBe(false);
});
