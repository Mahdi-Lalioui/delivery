import { Button, TextAreaField } from "@zaafran/ui";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useId, type ReactNode } from "react";
import { RestaurantQuantity } from "./restaurant-quantity";
import { getRestaurantMessages } from "./restaurant-messages";
import { getDraftTotalDzd, prepareItemLine, toggleItemOption, type ItemDraft } from "./item-draft";
import {
  localizeRestaurantText,
  type RestaurantGroup,
  type RestaurantItem,
} from "./restaurant-types";

/** "Choose 1", "Up to 2" or "Choose 1–3" for an option group. */
function rangeText(
  { minimum, maximum }: RestaurantGroup,
  messages: ReturnType<typeof getRestaurantMessages>,
) {
  if (minimum === maximum) return messages.chooseExactly.replace("{count}", String(minimum));
  if (minimum === 0) return messages.chooseUpTo.replace("{max}", String(maximum));
  return messages.chooseRange.replace("{min}", String(minimum)).replace("{max}", String(maximum));
}

function ItemOptions({
  group,
  draft,
  locale,
  onDraft,
}: {
  group: RestaurantGroup;
  draft: ItemDraft;
  locale: Locale;
  onDraft: (draft: ItemDraft) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const id = useId();
  const pricePrefix = "+";
  const selected =
    draft.selections.find((selection) => selection.optionGroupId === group.optionGroupId)
      ?.optionIds ?? [];
  const radio = group.maximum === 1;
  return (
    <fieldset className="restaurant-options">
      <legend>
        {localizeRestaurantText(group.names, locale)}{" "}
        <span>{group.minimum > 0 ? messages.required : messages.optional}</span>
      </legend>
      <p className="restaurant-muted">{rangeText(group, messages)}</p>
      {radio && group.minimum === 0 && (
        <label className="restaurant-choice">
          <input
            type="radio"
            name={id}
            checked={selected.length === 0}
            onChange={() => {
              onDraft({
                ...draft,
                selections: draft.selections.map((selection) =>
                  selection.optionGroupId === group.optionGroupId
                    ? { ...selection, optionIds: [] }
                    : selection,
                ),
              });
            }}
          />
          <span>{messages.none}</span>
        </label>
      )}
      {group.options.map((option) => (
        <label
          key={option.optionId}
          className="restaurant-choice"
          data-unavailable={!option.isAvailable}
        >
          <input
            type={radio ? "radio" : "checkbox"}
            name={id}
            checked={selected.includes(option.optionId)}
            disabled={
              !option.isAvailable ||
              (!radio && !selected.includes(option.optionId) && selected.length >= group.maximum)
            }
            onChange={() => {
              onDraft(toggleItemOption({ draft, group, optionId: option.optionId }));
            }}
          />
          <span>
            {localizeRestaurantText(option.names, locale)}{" "}
            {!option.isAvailable && <small>{messages.soldOut}</small>}
          </span>
          <bdi className="restaurant-price" dir="ltr">
            {option.priceDeltaDzd === 0
              ? null
              : pricePrefix + formatDzd(option.priceDeltaDzd, locale)}
          </bdi>
        </label>
      ))}
    </fieldset>
  );
}

export function ItemForm({
  children,
  detail,
  locale,
  draft,
  onDraft,
  onAdd,
}: {
  children?: ReactNode;
  detail: RestaurantItem;
  locale: Locale;
  draft: ItemDraft;
  onDraft: (draft: ItemDraft) => void;
  onAdd: () => void;
}) {
  const messages = getRestaurantMessages(locale);
  const totalDzd = getDraftTotalDzd(detail, draft);
  const valid = prepareItemLine(detail, draft, "preview").ok;
  return (
    <form
      className="restaurant-item-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onAdd();
      }}
    >
      <div className="restaurant-item-scroll">
        {children}
        <p className="restaurant-muted">
          {localizeRestaurantText(detail.item.descriptions, locale)}
        </p>
        {detail.optionGroups.map((group) => (
          <ItemOptions
            key={group.optionGroupId}
            group={group}
            draft={draft}
            locale={locale}
            onDraft={onDraft}
          />
        ))}
        <RestaurantQuantity
          label={messages.quantity}
          decreaseLabel={messages.decreaseQuantity}
          increaseLabel={messages.increaseQuantity}
          quantity={draft.quantity}
          onChange={(quantity) => {
            onDraft({ ...draft, quantity });
          }}
        />
        <TextAreaField
          label={messages.note}
          hint={messages.noteHint}
          maxLength={140}
          value={draft.note}
          rows={2}
          onChange={(event) => {
            onDraft({ ...draft, note: event.currentTarget.value });
          }}
        />
      </div>
      <div className="restaurant-item-submit">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isBlock
          disabled={!valid || totalDzd === null}
        >
          {messages.add +
            (totalDzd === null ? "" : messages.separator + formatDzd(totalDzd, locale))}
        </Button>
      </div>
    </form>
  );
}
