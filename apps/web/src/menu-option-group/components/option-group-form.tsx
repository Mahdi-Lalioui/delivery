import { useTranslations } from "next-intl";
import type { useOptionGroupEditor } from "../use-option-group-editor";
import { GroupFieldError, LimitFields, NameFields, OptionFields } from "./option-group-fields";

type Controls = ReturnType<typeof useOptionGroupEditor>;

export function OptionGroupForm({
  editor,
  controls,
}: {
  editor: NonNullable<Controls["editor"]>;
  controls: Controls;
}) {
  const translate = useTranslations("menuOptionGroup");
  const { draft, optionGroupId, invalid } = editor;

  return (
    <section className="option-group-card" aria-labelledby="option-group-editor-title">
      <h2 id="option-group-editor-title" tabIndex={-1}>
        {translate(optionGroupId ? "editTitle" : "createTitle")}
      </h2>
      <p className="option-group-hint">{translate("translationHint")}</p>
      <form
        method="post"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          controls.submit();
        }}
      >
        <fieldset className="option-group-form" disabled={controls.pending === "save"}>
          <NameFields
            names={draft.names}
            id="option-group-name"
            invalid={invalid?.field === "name"}
            change={(names) => {
              controls.changeDraft({ names });
            }}
          />
          <LimitFields
            draft={draft}
            changeDraft={controls.changeDraft}
            invalid={invalid?.field === "limits"}
          />
          <section className="option-group-fields" aria-labelledby="option-group-options">
            <h3 id="option-group-options" tabIndex={-1}>
              {translate("options")}
            </h3>
            {invalid?.field === "options" && (
              <GroupFieldError id="option-group-options-error" message="invalidOptions" />
            )}
            <ol className="option-group-fields" role="list" aria-labelledby="option-group-options">
              {draft.options.map((option, index) => (
                <OptionFields
                  key={option.key}
                  option={option}
                  index={index}
                  count={draft.options.length}
                  invalid={invalid}
                  controls={controls}
                />
              ))}
            </ol>
            <button
              className="option-group-secondary"
              id="option-group-add"
              type="button"
              disabled={draft.options.length >= 100}
              onClick={controls.addOption}
            >
              {translate("addOption")}
            </button>
          </section>
          <div className="option-group-actions">
            <button className="option-group-primary" id="option-group-save" type="submit">
              {translate(controls.pending === "save" ? "saving" : "save")}
            </button>
            <button className="option-group-secondary" type="button" onClick={controls.cancel}>
              {translate("cancel")}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
