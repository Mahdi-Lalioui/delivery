import { Button, Badge, Icon } from "@zaafran/ui";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useState } from "react";
import { useLowData } from "../discovery/low-data";
import { getRestaurantMessages } from "./restaurant-messages";
import { localizeRestaurantText, type RestaurantDish } from "./restaurant-types";

export function DishPhoto({
  merchantId,
  dish,
  locale,
}: {
  merchantId: string;
  dish: RestaurantDish;
  locale: Locale;
}) {
  const width = useLowData() ? 320 : 640;
  const [failed, setFailed] = useState(false);
  return (
    <div className="restaurant-dish-photo" aria-hidden="true">
      <div className="restaurant-photo-placeholder">
        <Icon name="plate" size={40} />
        <bdi>{localizeRestaurantText(dish.names, locale)}</bdi>
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
  onChoose,
}: {
  dish: RestaurantDish;
  merchantId: string;
  locale: Locale;
  onChoose: (dish: RestaurantDish) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const name = localizeRestaurantText(dish.names, locale);
  return (
    <article className="restaurant-dish" data-sold-out={!dish.isAvailable}>
      <DishPhoto merchantId={merchantId} dish={dish} locale={locale} />
      <div className="restaurant-dish-body">
        <h3>
          <bdi>{name}</bdi>
        </h3>
        <p className="restaurant-muted">{localizeRestaurantText(dish.descriptions, locale)}</p>
        <div className="restaurant-dish-actions">
          <bdi className="restaurant-price">{formatDzd(dish.priceDzd, locale)}</bdi>
          {dish.isAvailable ? (
            <Button
              variant="secondary"
              size="md"
              aria-label={messages.choose + messages.separator + name}
              onClick={() => {
                onChoose(dish);
              }}
            >
              {messages.choose}
            </Button>
          ) : (
            <Button variant="ghost" size="md" disabled>
              <Badge>{messages.soldOut}</Badge>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
