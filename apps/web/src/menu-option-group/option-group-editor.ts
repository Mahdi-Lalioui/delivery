import { menuOptionGroupCreateInput, menuOptionGroupUpdateInput } from "@zaafran/contracts/menu";
import type { OptionGroup, OptionGroupCommand } from "./option-group-http";

type Names = { ar: string; fr: string; en: string };
type Option = OptionGroup["options"][number];
export type OptionDraft = {
  key: string;
  optionId?: string;
  names: Names;
  price: string;
  isDefault: boolean;
  isAvailable: boolean;
};
export type GroupDraft = {
  names: Names;
  minimum: string;
  maximum: string;
  options: OptionDraft[];
};
export type GroupError =
  | { kind: "invalid"; field: "name" | "limits" | "options" }
  | { kind: "invalid"; field: "optionName" | "optionPrice"; optionKey: string };

const createFields = menuOptionGroupCreateInput.shape;
const optionFields = createFields.options.element.shape;

function createNames({ ar, fr, en }: OptionGroup["names"] = {}): Names {
  return { ar: ar ?? "", fr: fr ?? "", en: en ?? "" };
}

export function createOptionDraft(option?: Option): OptionDraft {
  if (option) {
    return {
      key: option.optionId,
      optionId: option.optionId,
      names: createNames(option.names),
      price: String(option.priceDeltaDzd),
      isDefault: option.isDefault,
      isAvailable: option.isAvailable,
    };
  }
  return {
    key: crypto.randomUUID(),
    names: createNames(),
    price: "0",
    isDefault: false,
    isAvailable: true,
  };
}

export function createGroupDraft(group?: OptionGroup): GroupDraft {
  return {
    names: createNames(group?.names),
    minimum: String(group?.minimum ?? 0),
    maximum: String(group?.maximum ?? 1),
    options: group ? group.options.map(createOptionDraft) : [createOptionDraft()],
  };
}

export function moveOption(options: OptionDraft[], index: number, delta: -1 | 1): OptionDraft[] {
  const source = options[index];
  const target = options[index + delta];
  if (!source || !target) return options;
  const reordered = [...options];
  reordered[index] = target;
  reordered[index + delta] = source;
  return reordered;
}

function suppliedNames({ ar, fr, en }: Names) {
  return { ...(ar.trim() && { ar }), ...(fr.trim() && { fr }), ...(en.trim() && { en }) };
}

function wholeNumber(input: string) {
  const digits = input.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
    const zero = digit <= "٩" ? "٠" : "۰";
    return String(digit.charCodeAt(0) - zero.charCodeAt(0));
  });
  return /^[0-9]+$/.test(digits) ? Number(digits) : Number.NaN;
}

function parseOption(option: OptionDraft) {
  const names = optionFields.names.safeParse(suppliedNames(option.names));
  if (!names.success)
    return { kind: "invalid", field: "optionName", optionKey: option.key } as const;
  const price = optionFields.priceDeltaDzd.safeParse(wholeNumber(option.price));
  if (!price.success)
    return { kind: "invalid", field: "optionPrice", optionKey: option.key } as const;

  return {
    kind: "valid",
    option: {
      names: names.data,
      priceDeltaDzd: price.data,
      isDefault: option.isDefault,
      isAvailable: option.isAvailable,
      ...(option.optionId === undefined ? {} : { optionId: option.optionId }),
    },
  } as const;
}

function groupInput(draft: GroupDraft) {
  const names = createFields.names.safeParse(suppliedNames(draft.names));
  if (!names.success) return { kind: "invalid", field: "name" } as const;
  const minimum = createFields.minimum.safeParse(wholeNumber(draft.minimum));
  const maximum = createFields.maximum.safeParse(wholeNumber(draft.maximum));
  if (!minimum.success || !maximum.success || minimum.data > maximum.data) {
    return { kind: "invalid", field: "limits" } as const;
  }
  if (draft.options.length < maximum.data) return { kind: "invalid", field: "limits" } as const;
  if (draft.options.length > 100) {
    return { kind: "invalid", field: "options" } as const;
  }
  if (draft.options.filter(({ isDefault }) => isDefault).length > maximum.data) {
    return { kind: "invalid", field: "options" } as const;
  }

  const options = [];
  for (const option of draft.options) {
    const result = parseOption(option);
    if (result.kind === "invalid") return result;
    options.push(result.option);
  }
  return {
    kind: "valid",
    input: { names: names.data, minimum: minimum.data, maximum: maximum.data, options },
  } as const;
}

export function parseGroupDraft({
  draft,
  expectedRevision,
  optionGroupId,
}: {
  draft: GroupDraft;
  expectedRevision: number;
  optionGroupId?: string;
}): { kind: "valid"; command: OptionGroupCommand } | GroupError {
  const parsed = groupInput(draft);
  if (parsed.kind === "invalid") return parsed;
  const input = { ...parsed.input, expectedRevision };
  if (optionGroupId) {
    const result = menuOptionGroupUpdateInput.safeParse(input);
    return result.success
      ? { kind: "valid", command: { kind: "edit", optionGroupId, input: result.data } }
      : { kind: "invalid", field: "options" };
  }
  const result = menuOptionGroupCreateInput.safeParse(input);
  return result.success
    ? { kind: "valid", command: { kind: "create", input: result.data } }
    : { kind: "invalid", field: "options" };
}

export interface GroupAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

export function prepareGroupAttempt(
  command: OptionGroupCommand,
  previous?: GroupAttempt,
): GroupAttempt {
  const fingerprint = JSON.stringify(command);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, idempotencyKey: crypto.randomUUID() };
}
