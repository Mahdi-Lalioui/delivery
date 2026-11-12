"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import type { FeedFilters } from "./feed-http";
import { getFeedMessages } from "./feed-messages";

const modes = [
  [undefined, "delivery", "bike"],
  ["pickup", "pickup", "bag"],
] as const;

/** Delivery / Pickup: a two-way switch whose sliding thumb follows the choice. */
export function FulfilmentToggle({
  locale,
  filters,
  onChange,
}: {
  locale: Locale;
  filters: FeedFilters;
  onChange: (filters: FeedFilters) => void;
}) {
  const messages = getFeedMessages(locale);
  const current = filters.fulfilment;
  return (
    <fieldset className="fulfilment-toggle" data-mode={current ?? "delivery"}>
      <legend className="ui-visually-hidden">{messages.fulfilment}</legend>
      {modes.map(([value, label, icon]) => (
        <label key={label} className="fulfilment-option">
          <input
            type="radio"
            name="fulfilment"
            checked={current === value}
            onChange={() => {
              const rest = Object.fromEntries(
                Object.entries(filters).filter(([key]) => key !== "fulfilment"),
              );
              onChange(value === undefined ? rest : { ...rest, fulfilment: value });
            }}
          />
          <Icon name={icon} size={18} />
          <span>{messages[label]}</span>
        </label>
      ))}
    </fieldset>
  );
}
