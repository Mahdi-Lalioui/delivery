import { menuItemCommandInput } from "@zaafran/contracts/menu";
import type { ItemInput, MenuItem, MenuItemCommand } from "./menu-item-http";

export type ItemDraft = ReturnType<typeof makeMenuItemDraft>;
export type ItemField = "names" | "descriptions" | "price" | "prep";

export function makeMenuItemDraft(item?: MenuItem) {
  const { names, descriptions, tags, optionGroupIds, extraPrepMinutes } = item ?? {
    names: {},
    descriptions: {},
    tags: [],
    optionGroupIds: [],
    extraPrepMinutes: 0,
  };

  return {
    nameAr: names.ar ?? "",
    nameFr: names.fr ?? "",
    nameEn: names.en ?? "",
    descriptionAr: descriptions.ar ?? "",
    descriptionFr: descriptions.fr ?? "",
    descriptionEn: descriptions.en ?? "",
    price: item ? String(item.priceDzd) : "",
    prep: String(extraPrepMinutes),
    tags: [...tags],
    optionGroupIds: [...optionGroupIds],
  };
}

function localizedFields(ar: string, fr: string, en: string) {
  return {
    ...(ar.trim() && { ar: ar.trim() }),
    ...(fr.trim() && { fr: fr.trim() }),
    ...(en.trim() && { en: en.trim() }),
  };
}

function parseWholeNumber(input: string): number {
  const digits = input.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
    const zero = digit <= "٩" ? "٠" : "۰";
    return String(digit.charCodeAt(0) - zero.charCodeAt(0));
  });
  return /^[0-9]+$/.test(digits) ? Number(digits) : Number.NaN;
}

export function parseMenuItemDraft({
  draft,
  categoryId,
  expectedRevision,
}: {
  draft: ItemDraft;
  categoryId: string;
  expectedRevision: number;
}): { kind: "valid"; input: ItemInput } | { kind: "invalid"; field: ItemField } {
  const shape = menuItemCommandInput.shape;
  const names = shape.names.safeParse(localizedFields(draft.nameAr, draft.nameFr, draft.nameEn));
  if (!names.success) return { kind: "invalid", field: "names" };
  const descriptions = shape.descriptions.safeParse(
    localizedFields(draft.descriptionAr, draft.descriptionFr, draft.descriptionEn),
  );
  if (!descriptions.success) return { kind: "invalid", field: "descriptions" };
  const price = shape.priceDzd.safeParse(parseWholeNumber(draft.price));
  if (!price.success) return { kind: "invalid", field: "price" };
  const prep = shape.extraPrepMinutes.safeParse(parseWholeNumber(draft.prep));
  if (!prep.success) return { kind: "invalid", field: "prep" };

  return {
    kind: "valid",
    input: {
      categoryId,
      expectedRevision,
      names: names.data,
      descriptions: descriptions.data,
      priceDzd: price.data,
      extraPrepMinutes: prep.data,
      photoId: null,
      tags: draft.tags,
      optionGroupIds: draft.optionGroupIds,
    },
  };
}

export type ItemAttempt = ReturnType<typeof newAttempt>;

function newAttempt(fingerprint: string) {
  return { fingerprint, idempotencyKey: crypto.randomUUID() };
}

export function prepareMenuItemAttempt(command: MenuItemCommand, previous?: ItemAttempt) {
  const fingerprint = JSON.stringify(command);
  return previous?.fingerprint === fingerprint ? previous : newAttempt(fingerprint);
}
