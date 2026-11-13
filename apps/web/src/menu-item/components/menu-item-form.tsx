import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { isAttachmentSaveBlocked } from "../item-attachments";
import type { ItemField } from "../item-editor";
import type { useMenuItemEditor } from "../use-menu-item-editor";
import { ItemAttachmentFields } from "./item-attachment-fields";
import { ItemPhotoField } from "./item-photo-field";

type Controls = ReturnType<typeof useMenuItemEditor>;
type Editor = NonNullable<Controls["editor"]>;

const localizedInputs = [
  ["nameAr", "nameFr", "nameEn"],
  ["descriptionAr", "descriptionFr", "descriptionEn"],
] as const;

const languageAttributes = [
  { lang: "ar", dir: "rtl" },
  { lang: "fr", dir: "ltr" },
  { lang: "en", dir: "ltr" },
] as const;

export const itemTags = [
  ["spicy", "spicy"],
  ["vegetarian", "vegetarian"],
  ["new", "newTag"],
  ["popular", "popular"],
] as const;

const validationMessages = {
  names: "invalidName",
  descriptions: "invalidDescription",
  price: "invalidPrice",
  prep: "invalidPrep",
} as const;

function FieldError({ field }: { field: ItemField }) {
  const translate = useTranslations("menuItem");
  return (
    <p className="menu-item-error" id={`menu-item-error-${field}`} role="alert">
      {translate(validationMessages[field])}
    </p>
  );
}

function validity(editor: Editor, field: ItemField) {
  return editor.invalid === field
    ? { "aria-invalid": true, "aria-describedby": `menu-item-error-${field}` }
    : {};
}

function TranslationFields({
  field,
  editor,
  changeDraft,
}: {
  field: "names" | "descriptions";
  editor: Editor;
  changeDraft: Controls["changeDraft"];
}) {
  const translate = useTranslations("menuItem");
  const names = field === "names";

  return (
    <fieldset className="menu-item-fields">
      <legend>{translate(field)}</legend>
      {localizedInputs[names ? 0 : 1].map((input, index) => {
        const attributes = {
          id: `menu-item-${input}`,
          ...languageAttributes[index],
          value: editor.draft[input],
          ...validity(editor, field),
        };

        return (
          <label key={input} className="menu-item-field" htmlFor={attributes.id}>
            {translate(input)}
            {names ? (
              <input
                {...attributes}
                type="text"
                maxLength={120}
                onChange={(event) => {
                  changeDraft({ [input]: event.currentTarget.value });
                }}
              />
            ) : (
              <textarea
                {...attributes}
                rows={3}
                maxLength={1000}
                onChange={(event) => {
                  changeDraft({ [input]: event.currentTarget.value });
                }}
              />
            )}
          </label>
        );
      })}
      {editor.invalid === field && <FieldError field={field} />}
    </fieldset>
  );
}

export function MenuItemForm({
  editor,
  locale,
  attachments,
  updateAttachments,
  retryAttachments,
  retry,
  pending,
  changeDraft,
  submitDraft,
  closeEditor,
  merchantId,
  sessionId,
}: Pick<
  Controls,
  | "pending"
  | "changeDraft"
  | "submitDraft"
  | "closeEditor"
  | "attachments"
  | "updateAttachments"
  | "retryAttachments"
  | "retry"
> & {
  editor: Editor;
  locale: Locale;
  merchantId: string;
  sessionId: string;
}) {
  const translate = useTranslations("menuItem");

  return (
    <section className="menu-item-card" aria-labelledby="menu-item-editor-title">
      <h2 id="menu-item-editor-title" tabIndex={-1}>
        {translate(editor.kind === "create" ? "createTitle" : "editTitle")}
      </h2>
      <p className="menu-item-hint">{translate("translationHint")}</p>
      <form
        method="post"
        noValidate
        className="menu-item-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitDraft();
        }}
      >
        <fieldset
          className="menu-item-form"
          disabled={pending || attachments.kind === "revision-conflict"}
        >
          <TranslationFields field="names" editor={editor} changeDraft={changeDraft} />
          <TranslationFields field="descriptions" editor={editor} changeDraft={changeDraft} />
          <div className="menu-item-numbers">
            <div className="menu-item-field">
              <label htmlFor="menu-item-price">{translate("price")}</label>
              <div className="menu-item-money">
                <input
                  id="menu-item-price"
                  dir="ltr"
                  type="text"
                  inputMode="numeric"
                  value={editor.draft.price}
                  onChange={(event) => {
                    changeDraft({ price: event.currentTarget.value });
                  }}
                  aria-describedby={
                    editor.invalid === "price"
                      ? "menu-item-currency menu-item-error-price"
                      : "menu-item-currency"
                  }
                  aria-invalid={editor.invalid === "price" || undefined}
                />
                <span id="menu-item-currency">{translate("currency")}</span>
              </div>
              {editor.invalid === "price" && <FieldError field="price" />}
            </div>
            <div className="menu-item-field">
              <label htmlFor="menu-item-prep">{translate("prepMinutes")}</label>
              <input
                id="menu-item-prep"
                dir="ltr"
                type="text"
                inputMode="numeric"
                value={editor.draft.prep}
                onChange={(event) => {
                  changeDraft({ prep: event.currentTarget.value });
                }}
                {...validity(editor, "prep")}
              />
              {editor.invalid === "prep" && <FieldError field="prep" />}
            </div>
          </div>
          <fieldset className="menu-item-fields">
            <legend>{translate("tags")}</legend>
            <div className="menu-item-actions">
              {itemTags.map(([tag, label]) => (
                <label className="menu-item-check" key={tag}>
                  <input
                    type="checkbox"
                    checked={editor.draft.tags.includes(tag)}
                    onChange={(event) => {
                      changeDraft({
                        tags: event.currentTarget.checked
                          ? [...editor.draft.tags, tag]
                          : editor.draft.tags.filter((value) => value !== tag),
                      });
                    }}
                  />
                  {translate(label)}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        <ItemPhotoField
          key={sessionId}
          merchantId={merchantId}
          sessionId={sessionId}
          photoId={editor.draft.photoId}
          onPhotoChange={(photoId) => {
            changeDraft({ photoId });
          }}
        />
        <ItemAttachmentFields
          attachments={attachments}
          ids={editor.draft.optionGroupIds}
          locale={locale}
          pending={pending}
          update={updateAttachments}
          retryAttachments={retryAttachments}
          reload={retry}
        />
        <div className="menu-item-actions">
          <button
            className="menu-item-primary"
            type="submit"
            id="menu-item-save"
            disabled={pending || isAttachmentSaveBlocked(attachments)}
          >
            {translate(pending ? "saving" : "save")}
          </button>
          <button
            className="menu-item-secondary"
            type="button"
            onClick={closeEditor}
            disabled={pending}
          >
            {translate("cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
