"use client";

import type { Locale } from "@zaafran/i18n/locales";
import type { FeedFilters } from "./feed-http";
import { getFeedMessages } from "./feed-messages";

const toggles = [
  ["openNow", "true", "filterOpenNow"],
  ["freeDelivery", "true", "filterFree"],
  ["minRating", "4", "filterRating"],
  ["maxEtaMinutes", "30", "filterFast"],
] as const;

const sorts = [
  ["relevance", "sortRelevance"],
  ["rating", "sortRating"],
  ["eta", "sortEta"],
] as const;

function without(filters: FeedFilters, key: string): FeedFilters {
  return Object.fromEntries(Object.entries(filters).filter(([name]) => name !== key));
}

/** Sticky filter chips and sort control for the full restaurant list (CUS-04, CUS-06). */
export function FeedFilterBar({
  locale,
  filters,
  onChange,
}: {
  locale: Locale;
  filters: FeedFilters;
  onChange: (filters: FeedFilters) => void;
}) {
  const messages = getFeedMessages(locale);
  const sort = filters.sort ?? "relevance";
  return (
    <div className="discovery-filter-bar" role="group" aria-label={messages.filters}>
      <ul className="discovery-filter-list" role="list">
        {toggles.map(([key, value, label]) => {
          const isOn = filters[key] === value;
          return (
            <li key={key}>
              <button
                type="button"
                className="discovery-filter"
                aria-pressed={isOn}
                onClick={() => {
                  onChange(isOn ? without(filters, key) : { ...filters, [key]: value });
                }}
              >
                {messages[label]}
              </button>
            </li>
          );
        })}
      </ul>
      <label className="discovery-sort">
        <span className="ui-visually-hidden">{messages.sort}</span>
        <select
          value={sort}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(next === "relevance" ? without(filters, "sort") : { ...filters, sort: next });
          }}
        >
          {sorts.map(([value, label]) => (
            <option key={value} value={value}>
              {messages[label]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
