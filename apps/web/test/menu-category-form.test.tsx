import { getMessages } from "@zaafran/i18n/messages";
import type * as NextIntl from "next-intl";
import { isValidElement } from "react";
import { expect, test, vi } from "vitest";
import { CategoryForm } from "../src/menu-category/components/category-form";
import type { MenuCategoryEditor } from "../src/menu-category/use-menu-category-editor";

// React DOM's server renderer cannot trigger submit events. Keep the component's form
// handler and replace the translation hook with the same catalog translator for this test.
vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof NextIntl>();
  return {
    ...original,
    useTranslations: () =>
      original.createTranslator({
        locale: "fr",
        namespace: "menuCategory",
        messages: getMessages("fr"),
      }),
  };
});

type FormSubmission = { onSubmit(event: { preventDefault(): void }): void };

test.each([false, true])(
  "[MER-09:categories] form submission prevents native navigation with revision conflict %s",
  (revisionConflict) => {
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controls: MenuCategoryEditor = {
      view: { kind: "loading" },
      draft: { ar: "", fr: "Dîner", en: "", from: "", to: "" },
      selectedId: undefined,
      fieldError: undefined,
      saveError: undefined,
      isSaving: false,
      isImportOpen: false,
      revisionConflict,
      notice: undefined,
      focus: undefined,
      edit: vi.fn(),
      update: vi.fn(),
      reload: vi.fn(),
      toggleImport: vi.fn(),
      refreshAfterImport: vi.fn(),
      showAccessFailure: vi.fn(),
      save,
      move: vi.fn(),
    };
    const form = CategoryForm({ controls });
    if (!isValidElement<FormSubmission>(form)) throw new Error("Expected a category form.");
    const preventDefault = vi.fn();

    form.props.onSubmit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledTimes(revisionConflict ? 0 : 1);
  },
);
