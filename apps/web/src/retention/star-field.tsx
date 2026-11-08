"use client";

import { useTranslations } from "next-intl";

const starValues = [1, 2, 3, 4, 5] as const;

/** A 1–5 star choice built from native radios, so it is keyboard and screen-reader friendly. */
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
      <legend>{props.legend}</legend>
      {starValues.map((value) => (
        <label key={value}>
          <input
            type="radio"
            name={props.name}
            value={value}
            defaultChecked={props.defaultValue === value}
          />
          <span className="star-field-icon" aria-hidden="true" />
          <span className="star-field-label">{translate("stars", { count: value })}</span>
        </label>
      ))}
    </fieldset>
  );
}
