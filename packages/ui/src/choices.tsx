import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** DESIGN §10 Toggle: a native checkbox with role="switch", so it posts with forms. */
export function Toggle(props: {
  label: string;
  description?: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="ui-toggle" htmlFor={id}>
      <span className="ui-toggle-text">
        <span className="ui-toggle-label">{props.label}</span>
        {props.description !== undefined && (
          <span className="ui-toggle-description">{props.description}</span>
        )}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ui-toggle-input"
        name={props.name}
        checked={props.checked}
        defaultChecked={props.defaultChecked}
        disabled={props.disabled}
        onChange={(event) => props.onChange?.(event.currentTarget.checked)}
      />
      <span className="ui-toggle-track" aria-hidden="true">
        <span className="ui-toggle-thumb" />
      </span>
    </label>
  );
}

export type SegmentOption<Value extends string> = { value: Value; label: string; icon?: IconName };

/** DESIGN §10 SegmentedControl: native radios (arrow keys, forms) drawn as one pill group. */
export function SegmentedControl<Value extends string>(props: {
  legend: string;
  name: string;
  options: readonly SegmentOption<Value>[];
  value?: Value;
  defaultValue?: Value;
  disabled?: boolean;
  isLegendVisible?: boolean;
  onChange?: (value: Value) => void;
}) {
  return (
    <fieldset className="ui-segmented" disabled={props.disabled}>
      <legend className={props.isLegendVisible === false ? "ui-visually-hidden" : "ui-field-label"}>
        {props.legend}
      </legend>
      <div className="ui-segmented-track" data-count={props.options.length}>
        {props.options.map((option) => (
          <label key={option.value} className="ui-segment">
            <input
              type="radio"
              name={props.name}
              value={option.value}
              checked={props.value === undefined ? undefined : props.value === option.value}
              defaultChecked={
                props.defaultValue === undefined ? undefined : props.defaultValue === option.value
              }
              onChange={() => props.onChange?.(option.value)}
            />
            <span className="ui-segment-face">
              {option.icon !== undefined && <Icon name={option.icon} size={18} />}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** DESIGN §10 Chip/FilterChip as a single-choice row (filters such as star ratings). */
export function ChipGroup<Value extends string>(props: {
  legend: string;
  options: readonly { value: Value; label: ReactNode }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="ui-chips">
      <legend className="ui-visually-hidden">{props.legend}</legend>
      {props.options.map((option) => (
        <label key={option.value} className="ui-chip">
          <input
            type="radio"
            name={name}
            checked={props.value === option.value}
            onChange={() => {
              props.onChange(option.value);
            }}
          />
          <span className="ui-chip-face">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
