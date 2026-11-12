import { Badge, Icon } from "@zaafran/ui";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useState, type MouseEvent } from "react";
import { useLowData } from "../discovery/low-data";
import { getRestaurantMessages } from "./restaurant-messages";
import type { Stepper } from "./restaurant-types";
import { localizeRestaurantText, type RestaurantDish } from "./restaurant-types";

/**
 * The whole card opens the dish, as in the best delivery apps; the card's own add button stays
 * the keyboard and screen-reader control, so the card click simply forwards to it.
 */
type Tapped = { closest: (selector: string) => unknown };
type Card = { querySelector: (selector: string) => { click: () => void } | null };

/** The add button a tap on the card should press, or null when the tap hit a control. */
export function cardTapTarget(target: Tapped, card: Card) {
  if (target.closest("button, a, input")) return null;
  return card.querySelector(".restaurant-dish-add:enabled");
}

export function openFromCard({ target, currentTarget }: MouseEvent<HTMLElement>) {
  if (target instanceof Element) cardTapTarget(target, currentTarget)?.click();
}

export function DishPhoto({ merchantId, dish }: { merchantId: string; dish: RestaurantDish }) {
  const width = useLowData() ? 320 : 640;
  const [failed, setFailed] = useState(false);
  return (
    <div className="restaurant-dish-photo" aria-hidden="true">
      <div className="restaurant-photo-placeholder">
        <Icon name="plate" size={32} />
      </div>
      {dish.photoId !== null && !failed && (
        <img
          alt=""
          width="640"
          height="480"
          loading="lazy"
          decoding="async"
          src={`/v1/merchants/${merchantId}/items/${dish.itemId}/photos/${dish.photoId}/variants/webp/${String(width)}`}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
    </div>
  );
}

/** The + morphs into − n + once a plain dish is in the cart (the brief's add-to-stepper). */
function DishStepper({
  name,
  stepper,
  onStep,
  locale,
}: {
  name: string;
  stepper: Stepper;
  onStep: (lineId: string, quantity: number) => void;
  locale: Locale;
}) {
  const messages = getRestaurantMessages(locale);
  return (
    <div className="restaurant-dish-stepper" role="group" aria-label={name}>
      <button
        type="button"
        aria-label={messages.decreaseQuantity + messages.separator + name}
        onClick={() => {
          onStep(stepper.lineId, stepper.quantity - 1);
        }}
      >
        <Icon name={stepper.quantity === 1 ? "close" : "minus"} size={18} />
      </button>
      <output key={stepper.quantity} aria-live="polite">
        {stepper.quantity}
      </output>
      <button
        type="button"
        aria-label={messages.increaseQuantity + messages.separator + name}
        disabled={stepper.quantity >= 20}
        onClick={() => {
          onStep(stepper.lineId, stepper.quantity + 1);
        }}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function DishCard({
  dish,
  merchantId,
  locale,
  quantityInCart,
  stepper,
  onStep,
  onChoose,
}: {
  dish: RestaurantDish;
  merchantId: string;
  locale: Locale;
  quantityInCart: number;
  stepper?: Stepper | undefined;
  onStep?: (lineId: string, quantity: number) => void;
  onChoose: (dish: RestaurantDish) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const name = localizeRestaurantText(dish.names, locale);
  const label = messages.choose + messages.separator + name;
  return (
    <article
      className="restaurant-dish"
      data-sold-out={!dish.isAvailable}
      data-dish={dish.itemId}
      onClick={openFromCard}
    >
      <div className="restaurant-dish-body">
        <h3>
          <bdi>{name}</bdi>
        </h3>
        <p className="restaurant-muted">{localizeRestaurantText(dish.descriptions, locale)}</p>
        <div className="restaurant-dish-actions">
          <bdi className="restaurant-price">{formatDzd(dish.priceDzd, locale)}</bdi>
          {!dish.isAvailable && <Badge>{messages.soldOut}</Badge>}
        </div>
      </div>
      <div className="restaurant-dish-media">
        <DishPhoto merchantId={merchantId} dish={dish} />
        {stepper && onStep ? (
          <DishStepper name={name} stepper={stepper} onStep={onStep} locale={locale} />
        ) : (
          <button
            type="button"
            className="restaurant-dish-add"
            aria-label={label}
            disabled={!dish.isAvailable}
            data-in-cart={quantityInCart > 0}
            onClick={() => {
              onChoose(dish);
            }}
          >
            {quantityInCart > 0 ? (
              <bdi key={quantityInCart}>
                {messages.inCartCount.replace("{count}", String(quantityInCart))}
              </bdi>
            ) : (
              <Icon name="plus" size={20} />
            )}
          </button>
        )}
      </div>
    </article>
  );
}
