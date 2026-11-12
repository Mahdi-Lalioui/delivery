"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { useEffect, useRef, useState } from "react";
import type { FeedFilters } from "./feed-http";
import { fillFeedMessage, getFeedMessages, type FeedMessages } from "./feed-messages";
import { activeFilters, type ActiveFilter } from "./filter-state";

const quickToggles = [
  ["openNow", "true", "filterOpenNow"],
  ["freeDelivery", "true", "filterFree"],
  ["minRating", "4", "filterRating"],
  ["maxEtaMinutes", "30", "filterFast"],
] as const;

const sorts = [
  ["relevance", "sortRelevance"],
  ["distance", "sortDistance"],
  ["rating", "sortRating"],
  ["eta", "sortEta"],
  ["fee", "sortFee"],
] as const;

const sheetToggles = [
  ["openNow", "true", "filterOpenNow"],
  ["freeDelivery", "true", "filterFree"],
  ["minRating", "4", "filterRating"],
] as const;

const payToggles = [
  ["acceptsBaridiPay", "payBaridi"],
  ["acceptsTpe", "payTpe"],
] as const;

const etaOptions = ["20", "30", "45"] as const;
const priceOptions = [
  ["1", "price1"],
  ["2", "price2"],
  ["3", "price3"],
] as const;

export function without(filters: FeedFilters, key: string): FeedFilters {
  return Object.fromEntries(Object.entries(filters).filter(([name]) => name !== key));
}

function withValue(filters: FeedFilters, key: string, value: string | undefined): FeedFilters {
  return value === undefined ? without(filters, key) : { ...filters, [key]: value };
}

/** The human label of one active filter, for chips and empty-state suggestions. */
export function filterLabel(messages: FeedMessages, { key, value }: ActiveFilter): string {
  if (key === "maxEtaMinutes") return fillFeedMessage(messages.etaOption, { minutes: value });
  if (key === "priceLevel")
    return messages[priceOptions.find(([level]) => level === value)?.[1] ?? "price1"];
  const toggle = [
    ...quickToggles,
    ...payToggles.map(([name, label]) => [name, "true", label] as const),
  ].find(([name]) => name === key);
  return toggle === undefined ? value : messages[toggle[2]];
}

function SegmentRow({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly (readonly [string | undefined, string])[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <fieldset className="filter-sheet-group">
      <legend>{legend}</legend>
      <div className="filter-sheet-pills">
        {options.map(([optionValue, label]) => (
          <label key={optionValue ?? "any"} className="filter-sheet-pill">
            <input
              type="radio"
              name={name}
              checked={value === optionValue}
              onChange={() => {
                onChange(optionValue);
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SheetBody({
  messages,
  draft,
  setDraft,
}: {
  messages: FeedMessages;
  draft: FeedFilters;
  setDraft: (filters: FeedFilters) => void;
}) {
  return (
    <div className="filter-sheet-body">
      <SegmentRow
        legend={messages.sortTitle}
        name="sort"
        options={sorts.map(([value, label]) => [
          value === "relevance" ? undefined : value,
          messages[label],
        ])}
        value={draft.sort}
        onChange={(value) => {
          setDraft(withValue(draft, "sort", value));
        }}
      />
      <fieldset className="filter-sheet-group">
        <legend>{messages.filtersTitle}</legend>
        {sheetToggles.map(([key, value, label]) => (
          <label key={key} className="filter-sheet-toggle">
            <span>{messages[label]}</span>
            <input
              type="checkbox"
              role="switch"
              checked={draft[key] === value}
              onChange={(event) => {
                setDraft(withValue(draft, key, event.currentTarget.checked ? value : undefined));
              }}
            />
          </label>
        ))}
      </fieldset>
      <SegmentRow
        legend={messages.maxEtaTitle}
        name="maxEtaMinutes"
        options={[
          [undefined, messages.anyOption],
          ...etaOptions.map(
            (minutes) => [minutes, fillFeedMessage(messages.etaOption, { minutes })] as const,
          ),
        ]}
        value={draft.maxEtaMinutes}
        onChange={(value) => {
          setDraft(withValue(draft, "maxEtaMinutes", value));
        }}
      />
      <SegmentRow
        legend={messages.priceTitle}
        name="priceLevel"
        options={[
          [undefined, messages.anyOption],
          ...priceOptions.map(([level, label]) => [level, messages[label]] as const),
        ]}
        value={draft.priceLevel}
        onChange={(value) => {
          setDraft(withValue(draft, "priceLevel", value));
        }}
      />
    </div>
  );
}

/** The full sort-and-filter bottom sheet; changes apply together with "Show restaurants". */
function FilterSheet({
  locale,
  filters,
  onApply,
  onClose,
}: {
  locale: Locale;
  filters: FeedFilters;
  onApply: (filters: FeedFilters) => void;
  onClose: () => void;
}) {
  const messages = getFeedMessages(locale);
  const [draft, setDraft] = useState(filters);
  const dialog = useRef<HTMLDialogElement>(null);
  const draftCount = activeFilters(draft).length + (draft.sort === undefined ? 0 : 1);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="filter-sheet"
      aria-labelledby="filter-sheet-title"
      onClose={onClose}
    >
      <header className="filter-sheet-header">
        <h2 id="filter-sheet-title">{messages.sheetTitle}</h2>
        <button
          type="button"
          className="filter-sheet-close"
          onClick={() => {
            setDraft(
              Object.fromEntries(Object.entries(draft).filter(([key]) => key === "cuisine")),
            );
          }}
        >
          {draftCount > 0
            ? fillFeedMessage(messages.clearAllCount, { count: String(draftCount) })
            : messages.clearAll}
        </button>
      </header>
      <SheetBody messages={messages} draft={draft} setDraft={setDraft} />
      <footer className="filter-sheet-footer">
        <button
          type="button"
          className="ui-button ui-button-primary ui-button-lg"
          onClick={() => {
            onApply(draft);
            dialog.current?.close();
          }}
        >
          {messages.apply}
        </button>
      </footer>
    </dialog>
  );
}

/** Sticky filter chips: the sheet button, quick toggles and removable active filters. */
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
  const [isSheetOpen, setSheetOpen] = useState(false);
  const active = activeFilters(filters);
  const quickKeys = new Set<string>(quickToggles.map(([key]) => key));
  const extra = active.filter(({ key }) => !quickKeys.has(key));
  const sort = sorts.find(([value]) => value === filters.sort);
  const count = active.length + (sort === undefined ? 0 : 1);
  return (
    <div className="discovery-filter-bar" role="group" aria-label={messages.filters}>
      <ul className="discovery-filter-list" role="list">
        <li>
          <button
            type="button"
            className="discovery-filter discovery-filter-sheet"
            aria-haspopup="dialog"
            data-count={count}
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            <Icon name="settings" size={18} />
            {messages.filterButton}
            {count > 0 && <span className="discovery-filter-count">{count}</span>}
          </button>
        </li>
        {sort && (
          <li>
            <button
              type="button"
              className="discovery-filter"
              aria-pressed="true"
              aria-label={fillFeedMessage(messages.removeFilter, { name: messages[sort[1]] })}
              onClick={() => {
                onChange(without(filters, "sort"));
              }}
            >
              {messages[sort[1]]}
              <Icon name="close" size={14} />
            </button>
          </li>
        )}
        {quickToggles.map(([key, value, label]) => {
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
        {extra.map((filter) => (
          <li key={filter.key}>
            <button
              type="button"
              className="discovery-filter"
              aria-pressed="true"
              aria-label={fillFeedMessage(messages.removeFilter, {
                name: filterLabel(messages, filter),
              })}
              onClick={() => {
                onChange(without(filters, filter.key));
              }}
            >
              {filterLabel(messages, filter)}
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      {isSheetOpen && (
        <FilterSheet
          locale={locale}
          filters={filters}
          onApply={onChange}
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}
