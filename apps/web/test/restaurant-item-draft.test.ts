import { expect, test } from "vitest";
import {
  createItemDraft,
  getDraftTotalDzd,
  prepareItemLine,
  toggleItemOption,
} from "../src/restaurant/item-draft";

import { detail } from "./restaurant-fixture";

test("[CUS-08:web] applies available defaults and blocks Add until required choices are satisfied", () => {
  const draft = createItemDraft(detail);
  expect(draft).toMatchObject({
    quantity: 1,
    note: "",
    selections: [
      { optionGroupId: "size", optionIds: [] },
      { optionGroupId: "extras", optionIds: ["cheese"] },
    ],
  });
  expect(prepareItemLine(detail, draft, "line").ok).toBe(false);
  expect(getDraftTotalDzd(detail, draft)).toBe(420);
  const size = detail.optionGroups[0];
  if (!size) throw new Error("Missing fixture group");
  const selected = toggleItemOption({ draft, group: size, optionId: "large" });
  expect(prepareItemLine(detail, { ...selected, quantity: 2 }, "line")).toMatchObject({
    ok: true,
    value: { quantity: 2, options: [{ optionId: "large" }, { optionId: "cheese" }] },
  });
  expect(getDraftTotalDzd(detail, { ...selected, quantity: 2 })).toBe(940);
});

test("[CUS-08:web] radio selection replaces the previous choice and multi-select respects max", () => {
  const size = detail.optionGroups[0];
  const extras = detail.optionGroups[1];
  if (!size || !extras) throw new Error("Missing fixture group");
  const draft = createItemDraft(detail);
  const large = toggleItemOption({ draft, group: size, optionId: "large" });
  const regular = toggleItemOption({ draft: large, group: size, optionId: "regular" });
  expect(regular.selections[0]?.optionIds).toEqual(["regular"]);
  const twoExtras = toggleItemOption({ draft: regular, group: extras, optionId: "sauce" });
  expect(twoExtras.selections[1]?.optionIds).toEqual(["cheese", "sauce"]);
  expect(toggleItemOption({ draft: twoExtras, group: extras, optionId: "soldout" })).toEqual(
    twoExtras,
  );
  expect(toggleItemOption({ draft: twoExtras, group: extras, optionId: "missing" })).toEqual(
    twoExtras,
  );
  expect(
    toggleItemOption({ draft: twoExtras, group: extras, optionId: "cheese" }).selections[1]
      ?.optionIds,
  ).toEqual(["sauce"]);
});

test("[CUS-08:web] refuses unsafe prices and out-of-range draft edits", () => {
  const draft = createItemDraft(detail);
  expect(getDraftTotalDzd(detail, { ...draft, quantity: 21 })).toBeNull();
  expect(
    getDraftTotalDzd(
      { ...detail, item: { ...detail.item, priceDzd: Number.MAX_SAFE_INTEGER } },
      draft,
    ),
  ).toBeNull();
  expect(prepareItemLine(detail, { ...draft, note: "x".repeat(141) }, "line")).toMatchObject({
    ok: false,
    error: { code: "invalid_note" },
  });
});
