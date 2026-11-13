import { useState } from "react";
import { Badge, Icon } from "@zaafran/ui";
import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { formatAlgiersDate } from "@zaafran/i18n/formats";
import { useLowData } from "../discovery/low-data";
import { FeedMeta } from "../discovery/feed-card";
import "../discovery/feed.css";
import { getFeedCuisineLabel } from "../discovery/feed-messages";
import { getRestaurantMessages } from "./restaurant-messages";
import type { Restaurant } from "./restaurant-types";

function minute(value: number): string {
  return (
    String(Math.floor(value / 60) % 24).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0")
  );
}

export function RestaurantHeader({ data, locale }: { data: Restaurant; locale: Locale }) {
  const width = useLowData() ? 320 : 960;
  const { restaurant } = data;
  const messages = getRestaurantMessages(locale);
  const [photoFailed, setPhotoFailed] = useState(false);
  const weekday = new Intl.DateTimeFormat(localeDetails[locale].tag, {
    weekday: "long",
    timeZone: "UTC",
  });
  function ranges(values: Restaurant["restaurant"]["hours"]["weekly"][number]["ranges"]) {
    if (values.length === 0) return messages.closed;
    const isAllDay = values.some(({ opensMinute, closesMinute }) => {
      return opensMinute === 0 && closesMinute === 24 * 60;
    });
    if (isAllDay) return messages.allDay;
    return values
      .map(
        (range) =>
          minute(range.opensMinute) +
          messages.rangeSeparator +
          minute(range.closesMinute) +
          (range.closesMinute <= range.opensMinute ? messages.separator + messages.nextDay : ""),
      )
      .join(messages.separator);
  }
  return (
    <header className="restaurant-header">
      <div className="restaurant-cover" aria-hidden="true">
        <div className="restaurant-photo-placeholder">
          <Icon name="plate" size={64} />
        </div>
        {restaurant.coverMediaId !== null && !photoFailed && (
          <img
            width="1280"
            height="720"
            alt=""
            decoding="async"
            fetchPriority="high"
            src={`/v1/merchants/${restaurant.merchantId}/profile/photos/${restaurant.coverMediaId}/variants/webp/${String(width)}`}
            onError={() => {
              setPhotoFailed(true);
            }}
          />
        )}
      </div>
      <a className="restaurant-back" href={`/${locale}/discover`} aria-label={messages.back}>
        <Icon name="chevron" size={24} />
      </a>
      <div className="restaurant-panel">
        <div className="restaurant-heading">
          <h1>
            <bdi>{restaurant.name}</bdi>
          </h1>
          <Badge tone={restaurant.isOpen ? "success" : "warning"}>
            {restaurant.isOpen ? messages.open : messages.closed}
          </Badge>
        </div>
        <ul className="restaurant-cuisines" role="list">
          {restaurant.cuisines.map((cuisine) => (
            <li key={cuisine}>{getFeedCuisineLabel(locale, cuisine)}</li>
          ))}
        </ul>
        <FeedMeta restaurant={restaurant} locale={locale} />
        {!restaurant.isOpen && (
          <p className="restaurant-closed-note" role="status">
            {messages.closedNote}
          </p>
        )}
        {/* Closed: the hours are what the diner needs next, so they start open. */}
        <details className="restaurant-hours" open={!restaurant.isOpen}>
          <summary>
            <Icon name="clock" size={16} />
            {messages.hours}
            <Icon name="chevron" size={16} />
          </summary>
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
      </div>
    </header>
  );
}
