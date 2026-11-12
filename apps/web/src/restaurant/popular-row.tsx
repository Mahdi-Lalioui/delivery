import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { useId } from "react";
import { DishPhoto, openFromCard } from "./dish-card";
import { getRestaurantMessages } from "./restaurant-messages";
import { localizeRestaurantText, type DishSelection } from "./restaurant-types";

/** The restaurant's popular dishes as a horizontal row of photo cards. */
export function PopularRow({
  selections,
  merchantId,
  locale,
  onChoose,
}: {
  selections: readonly DishSelection[];
  merchantId: string;
  locale: Locale;
  onChoose: (selection: DishSelection) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const headingId = useId();
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
