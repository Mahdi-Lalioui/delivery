"use client";

import { Icon } from "@zaafran/ui";
import { useTranslations } from "next-intl";

const starValues = [1, 2, 3, 4, 5] as const;

/** A 1–5 star choice from native radios (keyboard + forms); stars fill up to the chosen one. */
export function StarField(props: {
  name: string;
  legend: string;
  defaultValue: number | undefined;
  isDisabled: boolean;
  isInvalid: boolean;
}) {
  const translate = useTranslations("retentionRatings");
  return (
    <fieldset
      className="star-field"
      disabled={props.isDisabled}
      aria-invalid={props.isInvalid || undefined}
    >
      <legend className="ui-field-label">{props.legend}</legend>
      <div className="star-field-row">
        {starValues.map((value) => (
          <label key={value} className="star-field-star" data-value={value}>
            <input
              className="ui-visually-hidden"
              type="radio"
              name={props.name}
              value={value}
              defaultChecked={props.defaultValue === value}
            />
            <Icon name="star" size={44} />
            <span className="ui-visually-hidden">{translate("stars", { count: value })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Read-only stars with a text equivalent for screen readers. */
export function StarRow({ value, label }: { value: number; label: string }) {
  return (
    <span className="star-row" role="img" aria-label={label}>
      {starValues.map((star) => (
        <span key={star} className="star-row-star" data-filled={star <= value || undefined}>
          <Icon name="star" size={16} />
        </span>
      ))}
    </span>
  );
}
