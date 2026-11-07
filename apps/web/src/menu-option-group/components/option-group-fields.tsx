import { useTranslations } from "next-intl";
import type { GroupDraft, GroupError, OptionDraft } from "../option-group-editor";
import type { useOptionGroupEditor } from "../use-option-group-editor";

type Controls = ReturnType<typeof useOptionGroupEditor>;
type NameValues = GroupDraft["names"];
const nameFields = [
  { language: "ar", direction: "rtl", label: "nameAr" },
  { language: "fr", direction: "ltr", label: "nameFr" },
  { language: "en", direction: "ltr", label: "nameEn" },
] as const;

export function GroupFieldError({
  id,
  message,
}: {
  id: string;
  message:
    "invalidName" | "invalidLimits" | "invalidOptionName" | "invalidPrice" | "invalidOptions";
}) {
  const translate = useTranslations("menuOptionGroup");
  return (
    <p id={id} className="option-group-error" role="alert">
      {translate(message)}
    </p>
  );
}

export function NameFields({
  names,
  id,
  change,
  invalid = false,
  isOption = false,
}: {
  names: NameValues;
  id: string;
  change: (names: NameValues) => void;
  invalid?: boolean;
  isOption?: boolean;
}) {
  const translate = useTranslations("menuOptionGroup");
  const errorId = `${id}-name-error`;

  return (
    <fieldset className="option-group-fields">
      <legend>{translate(isOption ? "optionNames" : "names")}</legend>
      {nameFields.map(({ language, direction, label }) => (
        <label className="option-group-field" key={language} htmlFor={`${id}-${language}`}>
          {translate(label)}
          <input
            id={`${id}-${language}`}
            type="text"
            lang={language}
            dir={direction}
            maxLength={120}
            value={names[language]}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => {
              change({ ...names, [language]: event.currentTarget.value });
            }}
          />
        </label>
      ))}
      {invalid && (
        <GroupFieldError id={errorId} message={isOption ? "invalidOptionName" : "invalidName"} />
      )}
    </fieldset>
  );
}

export function LimitFields({
  draft,
  changeDraft,
  invalid,
}: {
  draft: GroupDraft;
  changeDraft: Controls["changeDraft"];
  invalid: boolean;
}) {
  const translate = useTranslations("menuOptionGroup");
  const errorId = "option-group-limit-error";
  const fields = ["minimum", "maximum"] as const;
  return (
    <div className="option-group-limits">
      {fields.map((field) => (
        <label className="option-group-field" key={field} htmlFor={`option-group-${field}`}>
          {translate(field)}
          <input
            id={`option-group-${field}`}
            type="text"
            dir="ltr"
            inputMode="numeric"
            value={draft[field]}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => {
              changeDraft({ [field]: event.currentTarget.value });
            }}
          />
        </label>
      ))}
      {invalid && <GroupFieldError id={errorId} message="invalidLimits" />}
    </div>
  );
}

function OptionPrice({
  option,
  changeOption,
  invalid,
}: {
  option: OptionDraft;
  changeOption: Controls["changeOption"];
  invalid: boolean;
}) {
  const translate = useTranslations("menuOptionGroup");
  const id = `option-group-${option.key}`;
  const currencyId = `${id}-currency`;
  const errorId = `${id}-price-error`;
  return (
    <div className="option-group-field">
      <label htmlFor={`${id}-price`}>{translate("priceDelta")}</label>
      <div className="option-group-money">
        <input
          id={`${id}-price`}
          type="text"
          dir="ltr"
          inputMode="numeric"
          value={option.price}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${currencyId} ${errorId}` : currencyId}
          onChange={(event) => {
            changeOption(option.key, { price: event.currentTarget.value });
          }}
        />
        <span id={currencyId}>{translate("currency")}</span>
      </div>
      {invalid && <GroupFieldError id={errorId} message="invalidPrice" />}
    </div>
  );
}

function OptionFlags({
  option,
  changeOption,
}: {
  option: OptionDraft;
  changeOption: Controls["changeOption"];
}) {
  const translate = useTranslations("menuOptionGroup");
  const flags = [
    ["isDefault", "defaultChoice"],
    ["isAvailable", "available"],
  ] as const;
  return (
    <div className="option-group-actions">
      {flags.map(([field, label]) => (
        <label className="option-group-check" key={field}>
          <input
            type="checkbox"
            checked={option[field]}
            onChange={(event) => {
              changeOption(option.key, { [field]: event.currentTarget.checked });
            }}
          />
          {translate(label)}
        </label>
      ))}
    </div>
  );
}

function OptionActions({
  id,
  index,
  count,
  controls,
}: {
  id: string;
  index: number;
  count: number;
  controls: Pick<Controls, "reorderOption" | "removeOption">;
}) {
  const translate = useTranslations("menuOptionGroup");
  const position = String(index + 1);
  return (
    <div className="option-group-actions">
      <button
        className="option-group-secondary"
        id={`${id}-earlier`}
        type="button"
        disabled={index === 0}
        onClick={() => {
          controls.reorderOption(index, -1);
        }}
      >
        {translate("moveEarlier", { position })}
      </button>
      <button
        className="option-group-secondary"
        id={`${id}-later`}
        type="button"
        disabled={index === count - 1}
        onClick={() => {
          controls.reorderOption(index, 1);
        }}
      >
        {translate("moveLater", { position })}
      </button>
      <button
        className="option-group-secondary"
        type="button"
        disabled={count === 1}
        onClick={() => {
          controls.removeOption(index);
        }}
      >
        {translate("removeOption", { position })}
      </button>
    </div>
  );
}

export function OptionFields({
  option,
  index,
  count,
  invalid,
  controls,
}: {
  option: OptionDraft;
  index: number;
  count: number;
  invalid: GroupError | null;
  controls: Pick<Controls, "changeOption" | "reorderOption" | "removeOption">;
}) {
  const translate = useTranslations("menuOptionGroup");
  const id = `option-group-${option.key}`;
  const title = `${id}-heading`;
  const invalidField =
    invalid && "optionKey" in invalid && invalid.optionKey === option.key ? invalid.field : null;

  return (
    <li className="option-group-choice" aria-labelledby={title}>
      <h3 id={title} tabIndex={-1}>
        {translate("optionTitle", { position: String(index + 1) })}
      </h3>
      <NameFields
        names={option.names}
        id={id}
        isOption
        invalid={invalidField === "optionName"}
        change={(names) => {
          controls.changeOption(option.key, { names });
        }}
      />
      <OptionPrice
        option={option}
        changeOption={controls.changeOption}
        invalid={invalidField === "optionPrice"}
      />
      <OptionFlags option={option} changeOption={controls.changeOption} />
      <OptionActions id={id} index={index} count={count} controls={controls} />
    </li>
  );
}
