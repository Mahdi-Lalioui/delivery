import { useState } from "react";
import { Badge, Icon } from "@zaafran/ui";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { formatAlgiersDate } from "@zaafran/i18n/formats";
import { getFeedCuisineLabel } from "../discovery/feed-messages";
import { getRestaurantMessages } from "./restaurant-messages";
import type { Restaurant } from "./restaurant-types";

function minute(value: number): string {
  return (
    String(Math.floor(value / 60) % 24).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0")
  );
}

export function RestaurantHeader({ data, locale }: { data: Restaurant; locale: Locale }) {
  const { restaurant } = data;
  const messages = getRestaurantMessages(locale);
  const [photoFailed, setPhotoFailed] = useState(false);
  const weekday = new Intl.DateTimeFormat(localeDetails[locale].tag, {
    weekday: "long",
    timeZone: "UTC",
  });
  function ranges(values: Restaurant["restaurant"]["hours"]["weekly"][number]["ranges"]) {
    return values.length === 0
      ? messages.closed
      : values
          .map(
            (range) =>
              minute(range.opensMinute) +
              messages.rangeSeparator +
              minute(range.closesMinute) +
              (range.closesMinute <= range.opensMinute
                ? messages.separator + messages.nextDay
                : ""),
          )
          .join(messages.separator);
  }
  return (
    <header className="restaurant-header">
      <div className="restaurant-cover" aria-hidden="true">
        <div className="restaurant-photo-placeholder">
          <Icon name="plate" size={64} />
          <bdi>{restaurant.name}</bdi>
        </div>
        {restaurant.coverMediaId !== null && !photoFailed && (
          <img
            width="1280"
            height="720"
            alt=""
            decoding="async"
            src={`/v1/merchants/${restaurant.merchantId}/profile/photos/${restaurant.coverMediaId}/variants/webp/960`}
            onError={() => {
              setPhotoFailed(true);
            }}
          />
        )}
      </div>
      <div className="restaurant-heading">
        <div>
          <p className="eyebrow">{messages.menu}</p>
          <h1>
            <bdi>{restaurant.name}</bdi>
          </h1>
        </div>
        <Badge tone={restaurant.isOpen ? "success" : "warning"}>
          {restaurant.isOpen ? messages.open : messages.closed}
        </Badge>
      </div>
      <ul className="restaurant-cuisines" role="list">
        {restaurant.cuisines.map((cuisine) => (
          <li key={cuisine}>
            <Icon name="plate" size={16} />
            {getFeedCuisineLabel(locale, cuisine)}
          </li>
        ))}
      </ul>
      <details className="restaurant-hours">
        <summary>{messages.hours}</summary>
        <dl>
          {restaurant.hours.weekly.map((day) => (
            <div key={day.weekday}>
              <dt>{weekday.format(Date.UTC(2026, 10, 1 + day.weekday))}</dt>
              <dd>
                <bdi>{ranges(day.ranges)}</bdi>
              </dd>
            </div>
          ))}
          {restaurant.hours.specialDates.map((day) => (
            <div key={day.date}>
              <dt>{formatAlgiersDate(new Date(day.date + "T12:00:00Z"), locale)}</dt>
              <dd>
                <bdi>{ranges(day.ranges)}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </header>
  );
}
