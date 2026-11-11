import { Badge, Icon } from "@zaafran/ui";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useState } from "react";
import { useLowData } from "../discovery/low-data";
import { getRestaurantMessages } from "./restaurant-messages";
import { localizeRestaurantText, type RestaurantDish } from "./restaurant-types";

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

export function DishCard({
  dish,
  merchantId,
  locale,
  quantityInCart,
  onChoose,
}: {
  dish: RestaurantDish;
  merchantId: string;
  locale: Locale;
  quantityInCart: number;
  onChoose: (dish: RestaurantDish) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const name = localizeRestaurantText(dish.names, locale);
  const label = messages.choose + messages.separator + name;
  return (
    <article className="restaurant-dish" data-sold-out={!dish.isAvailable}>
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
        {
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
        }
      </div>
    </article>
  );
}
