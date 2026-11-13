import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { useId } from "react";
import { DishPhoto, openFromCard } from "./dish-card";
import { getRestaurantMessages } from "./restaurant-messages";
import { localizeRestaurantText, type DishSelection } from "./restaurant-types";

/** Same size as the real row: heading, then cards with a 4:3 photo, a name and a price. */
function PopularPlaceholder({ title }: { title: string }) {
  return (
    <section className="restaurant-popular" aria-hidden="true" data-pending="true">
      <h2>{title}</h2>
      <ul className="restaurant-popular-list" role="list">
        {[0, 1, 2].map((index) => (
          <li key={index} className="restaurant-popular-card">
            <div className="restaurant-dish-photo" />
            <div className="restaurant-popular-body">
              <h3>&nbsp;</h3>
              <span className="restaurant-price">&nbsp;</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The restaurant's popular dishes as a horizontal row of photo cards. */
export function PopularRow({
  selections,
  merchantId,
  locale,
  onChoose,
  isPending = false,
}: {
  selections: readonly DishSelection[];
  /** Dishes still loading: hold the row's space so the menu below does not jump. */
  isPending?: boolean;
  merchantId: string;
  locale: Locale;
  onChoose: (selection: DishSelection) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const headingId = useId();
  if (isPending && selections.length === 0) return <PopularPlaceholder title={messages.popular} />;
  if (selections.length === 0) return null;
  return (
    <section className="restaurant-popular" aria-labelledby={headingId}>
      <h2 id={headingId}>{messages.popular}</h2>
      <ul className="restaurant-popular-list" role="list">
        {selections.map((selection) => {
          const name = localizeRestaurantText(selection.dish.names, locale);
          return (
            <li
              key={selection.dish.itemId}
              className="restaurant-popular-card"
              onClick={openFromCard}
            >
              <DishPhoto merchantId={merchantId} dish={selection.dish} />
              <div className="restaurant-popular-body">
                <h3>
                  <bdi>{name}</bdi>
                </h3>
                <bdi className="restaurant-price">{formatDzd(selection.dish.priceDzd, locale)}</bdi>
              </div>
              <button
                type="button"
                className="restaurant-dish-add"
                aria-label={messages.popular + messages.separator + name}
                onClick={() => {
                  onChoose(selection);
                }}
              >
                <Icon name="plus" size={20} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
