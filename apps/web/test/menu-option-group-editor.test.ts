import { expect, test } from "vitest";
import {
  createGroupDraft,
  createOptionDraft,
  moveOption,
  parseGroupDraft,
  prepareGroupAttempt,
} from "../src/menu-option-group/option-group-editor";
import type { OptionGroup } from "../src/menu-option-group/option-group-http";

const optionGroupId = "019d6abc-1234-7234-8234-123456789000";
const first = "019d6abc-1234-7234-8234-123456789001";
const second = "019d6abc-1234-7234-8234-123456789002";
const group = {
  optionGroupId,
  names: { ar: "صلصات", fr: "Sauces" },
  minimum: 0,
  maximum: 2,
  options: [
    {
      optionId: first,
      names: { fr: "Ail" },
      priceDeltaDzd: 0,
      isDefault: false,
      isAvailable: true,
    },
    {
      optionId: second,
      names: { ar: "حارة" },
      priceDeltaDzd: 25,
      isDefault: true,
      isAvailable: false,
    },
  ],
} satisfies OptionGroup;

test("[MER-10] editing preserves stable identities and the new option order", () => {
  const draft = createGroupDraft(group);
  draft.options = moveOption(draft.options, 1, -1);
  draft.options.push({ ...createOptionDraft(), names: { ar: "", fr: "Citron", en: "" } });
  const result = parseGroupDraft({ draft, expectedRevision: 8, optionGroupId });
  expect(result).toMatchObject({
    kind: "valid",
    command: {
      kind: "edit",
      optionGroupId,
      input: {
        expectedRevision: 8,
        options: [
          group.options[1],
          group.options[0],
          { names: { fr: "Citron" }, priceDeltaDzd: 0, isDefault: false, isAvailable: true },
        ],
      },
    },
  });
  expect(moveOption(draft.options, 0, -1)).toBe(draft.options);
});

test("[MER-10] creates bilingual choices with integer DZD and independent stock/default state", () => {
  const draft = createGroupDraft();
  draft.names.fr = "  Sauces  ";
  const [option] = draft.options;
  if (!option) throw new Error("Expected an initial option");
  option.names.ar = "حارة";
  option.price = "٢٥";
  option.isDefault = true;
  option.isAvailable = false;
  expect(parseGroupDraft({ draft, expectedRevision: 8 })).toEqual({
    kind: "valid",
    command: {
      kind: "create",
      input: {
        names: { fr: "Sauces" },
        minimum: 0,
        maximum: 1,
        expectedRevision: 8,
        options: [
          { names: { ar: "حارة" }, priceDeltaDzd: 25, isDefault: true, isAvailable: false },
        ],
      },
    },
  });
});

test("[MER-10] rejects option fractions, missing bilingual content and invalid limits", () => {
  const draft = createGroupDraft(group);
  const [option] = draft.options;
  if (!option) throw new Error("Expected a stored option");
  expect(
    parseGroupDraft({ draft: { ...draft, maximum: "3" }, expectedRevision: 8, optionGroupId }),
  ).toEqual({ kind: "invalid", field: "limits" });
  expect(
    parseGroupDraft({
      draft: { ...draft, names: { ar: "", fr: "", en: "Sauces" } },
      expectedRevision: 8,
      optionGroupId,
    }),
  ).toEqual({ kind: "invalid", field: "name" });

  option.price = "1.50";
  expect(parseGroupDraft({ draft, expectedRevision: 8, optionGroupId })).toEqual({
    kind: "invalid",
    field: "optionPrice",
    optionKey: option.key,
  });
  option.price = "0";
  option.names.fr = "";
  expect(parseGroupDraft({ draft, expectedRevision: 8, optionGroupId })).toEqual({
    kind: "invalid",
    field: "optionName",
    optionKey: option.key,
  });
});

test("[MER-10] the same command retry reuses its key, but a change to option order gets a new key", () => {
  const draft = createGroupDraft(group);
  const result = parseGroupDraft({ draft, expectedRevision: 8, optionGroupId });
  if (result.kind !== "valid") throw new Error("Expected a valid group");
  const previous = prepareGroupAttempt(result.command);
  expect(prepareGroupAttempt(result.command, previous)).toBe(previous);
  draft.options = moveOption(draft.options, 1, -1);
  const reordered = parseGroupDraft({ draft, expectedRevision: 8, optionGroupId });
  if (reordered.kind !== "valid") throw new Error("Expected a valid reordered group");
  expect(prepareGroupAttempt(reordered.command, previous).idempotencyKey).not.toBe(
    previous.idempotencyKey,
  );
});

test("[MER-10] the selection maximum counts default choices independently of availability", () => {
  const draft = createGroupDraft(group);
  const options = draft.options.map((option) => ({
    ...option,
    isDefault: true,
    isAvailable: false,
  }));
  expect(
    parseGroupDraft({
      draft: { ...draft, maximum: "1", options },
      expectedRevision: 8,
      optionGroupId,
    }),
  ).toEqual({ kind: "invalid", field: "options" });
});
