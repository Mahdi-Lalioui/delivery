"use client";

import { useTranslations } from "next-intl";
import type { MenuCategoryEditor } from "../use-menu-category-editor";

const nameInputs = [
  ["ar", "nameAr", "rtl"],
  ["fr", "nameFr", "ltr"],
  ["en", "nameEn", "ltr"],
] as const;
const timeInputs = ["from", "to"] as const;

export function CategoryForm({ controls }: { controls: MenuCategoryEditor }) {
  const translate = useTranslations("menuCategory");
  const { draft, fieldError, isSaving, revisionConflict } = controls;
  const disabled = isSaving || revisionConflict || controls.isImportOpen;
  const nameError = fieldError === "names";
  const timeError = fieldError === "availability";

  return (
    <form
      className="menu-category-card menu-category-form"
      method="post"
      noValidate
      aria-busy={isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void controls.save();
      }}
    >
      <h2>{translate(controls.selectedId ? "editTitle" : "createTitle")}</h2>
      <fieldset className="menu-category-fields" disabled={disabled}>
        <p className="menu-category-hint" id="menu-category-name-hint">
          {translate("nameHint")}
        </p>
        {nameInputs.map(([language, label, direction]) => (
          <div className="menu-category-field" key={language}>
            <label htmlFor={`menu-category-name-${language}`}>{translate(label)}</label>
            <input
              id={`menu-category-name-${language}`}
              name={language}
              type="text"
              maxLength={120}
              dir={direction}
              value={draft[language]}
              aria-invalid={nameError}
              aria-describedby={
                nameError
                  ? "menu-category-name-hint menu-category-name-error"
                  : "menu-category-name-hint"
              }
              onChange={(event) => {
                controls.update(language, event.currentTarget.value);
              }}
            />
          </div>
        ))}
        {nameError && (
          <p className="menu-category-error" role="alert" id="menu-category-name-error">
            {translate("invalidName")}
          </p>
        )}
        <fieldset className="menu-category-fields">
          <legend>{translate("availability")}</legend>
          <p className="menu-category-hint" id="menu-category-time-hint">
            {translate("availabilityHint")}
          </p>
          <div className="menu-category-times">
            {timeInputs.map((field) => (
              <div className="menu-category-field" key={field}>
                <label htmlFor={`menu-category-time-${field}`}>{translate(field)}</label>
                <input
                  id={`menu-category-time-${field}`}
                  name={field}
                  type="text"
                  maxLength={5}
                  dir="ltr"
                  autoComplete="off"
                  value={draft[field]}
                  aria-invalid={timeError}
                  aria-describedby={
                    timeError
                      ? "menu-category-time-hint menu-category-time-error"
                      : "menu-category-time-hint"
                  }
                  onChange={(event) => {
                    controls.update(field, event.currentTarget.value);
                  }}
                />
              </div>
            ))}
          </div>
          {timeError && (
            <p className="menu-category-error" role="alert" id="menu-category-time-error">
              {translate("invalidWindow")}
            </p>
          )}
        </fieldset>
      </fieldset>
      <button className="menu-category-primary" type="submit" disabled={disabled}>
        {translate(isSaving ? "saving" : "save")}
      </button>
    </form>
  );
}
