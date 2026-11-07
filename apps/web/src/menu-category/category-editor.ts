import { menuCategoryCommandInput } from "@zaafran/contracts/menu";
import type { CategoryInput, CategoryOrderInput, MenuCategory } from "./menu-category-http";

export interface CategoryDraft {
  ar: string;
  fr: string;
  en: string;
  from: string;
  to: string;
}

export type CategoryFieldError = "names" | "availability";

type DraftResult =
  { kind: "valid"; input: CategoryInput } | { kind: "invalid"; field: CategoryFieldError };

function normalizeTime(value: string): string {
  return value.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
    const zero = digit >= "۰" ? "۰" : "٠";
    return String(digit.charCodeAt(0) - zero.charCodeAt(0));
  });
}

export function makeCategoryDraft(category?: MenuCategory): CategoryDraft {
  if (!category) return { ar: "", fr: "", en: "", from: "", to: "" };

  const { names, availability } = category;
  return {
    ar: names.ar ?? "",
    fr: names.fr ?? "",
    en: names.en ?? "",
    ...(availability ?? { from: "", to: "" }),
  };
}

export function parseCategoryDraft(draft: CategoryDraft, expectedRevision: number): DraftResult {
  const from = normalizeTime(draft.from);
  const to = normalizeTime(draft.to);
  const result = menuCategoryCommandInput.safeParse({
    names: {
      ...(draft.ar.trim() ? { ar: draft.ar } : {}),
      ...(draft.fr.trim() ? { fr: draft.fr } : {}),
      ...(draft.en.trim() ? { en: draft.en } : {}),
    },
    availability: from || to ? { from, to } : null,
    expectedRevision,
  });
  if (result.success) return { kind: "valid", input: result.data };

  const hasNameError = result.error.issues.some(({ path: [field] }) => field === "names");
  return { kind: "invalid", field: hasNameError ? "names" : "availability" };
}

export function moveMenuCategory(
  categoryIds: readonly string[],
  sourceId: string,
  targetId: string,
): string[] | undefined {
  const source = categoryIds.indexOf(sourceId);
  const target = categoryIds.indexOf(targetId);
  if (source < 0 || target < 0 || source === target) return undefined;

  const moved = [...categoryIds];
  moved.splice(source, 1);
  moved.splice(target, 0, sourceId);
  return moved;
}

export type CategoryCommand =
  | { kind: "category"; categoryId?: string; input: CategoryInput }
  | { kind: "order"; input: CategoryOrderInput };

interface CategoryAttempt {
  command: CategoryCommand;
  idempotencyKey: string;
}

export function prepareCategoryAttempt(
  command: CategoryCommand,
  previous?: CategoryAttempt,
): CategoryAttempt {
  if (previous && JSON.stringify(previous.command) === JSON.stringify(command)) return previous;
  return { command, idempotencyKey: crypto.randomUUID() };
}
