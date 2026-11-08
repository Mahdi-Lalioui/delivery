import { expect, test } from "vitest";
import {
  menuPreviewDetailOutput,
  menuPreviewItemQuery,
  menuPreviewPageOutput,
} from "../src/menu.ts";

const id = "01932f18-3150-7c33-8a7a-53acfd343001";
const nextId = "01932f18-3150-7c33-8a7a-53acfd343002";
const revision = 4;
const names = { ar: "طبق تجريبي", fr: "Plat fictif" };
const card = {
  itemId: id,
  names,
  descriptions: { fr: "Description fictive" },
  priceDzd: 750,
  tags: ["vegetarian"],
  isAvailable: false,
  photoId: nextId,
};
const page = {
  sessionId: id,
  revision,
  context: { restaurantName: "Restaurant fictif", categoryNames: names },
  items: [card],
  nextCursor: `${String(revision)}~${id}`,
};

test("[M2-10:preview] lists display fields with a cursor bound to the menu revision", () => {
  expect(menuPreviewPageOutput.parse(page)).toEqual(page);
  expect(menuPreviewPageOutput.safeParse({ ...page, nextCursor: `3~${id}` }).success).toBe(false);
  expect(menuPreviewPageOutput.safeParse({ ...page, context: undefined }).success).toBe(false);
  for (const privateFields of [
    { moderationStatus: "blocked_pending_review" },
    { storageKey: "private/variant" },
    { soldOutUntil: "2026-11-08T18:00:00Z" },
    { optionGroupIds: [id] },
  ]) {
    expect(
      menuPreviewPageOutput.safeParse({ ...page, items: [{ ...card, ...privateFields }] }).success,
    ).toBe(false);
  }
});

test("[M2-10:preview] requires a revision and returns displayable option groups in order", () => {
  expect(menuPreviewItemQuery.parse({ expectedRevision: "4" })).toEqual({ expectedRevision: 4 });
  for (const value of [undefined, "-1", "4.5", "004", "4e2"]) {
    expect(menuPreviewItemQuery.safeParse({ expectedRevision: value }).success).toBe(false);
  }
  const group = {
    optionGroupId: id,
    names,
    minimum: 0,
    maximum: 1,
    options: [{ optionId: nextId, names, priceDeltaDzd: 30, isDefault: false, isAvailable: true }],
  };
  const detail = { sessionId: id, revision, item: card, optionGroups: [group] };
  expect(menuPreviewDetailOutput.parse(detail)).toEqual(detail);
  expect(
    menuPreviewDetailOutput.safeParse({
      ...detail,
      optionGroups: [{ ...group, maximum: 2 }],
    }).success,
  ).toBe(false);
});
