import { photoRatios, type photoVariantWidths } from "@zaafran/contracts/media";
import { formatAlgiersDate, formatAlgiersTime, formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { useEffect, useState } from "react";
import { readFavourites, toggleFavourite } from "./favourites";
import { useLowData } from "./low-data";
import type { FeedRestaurant } from "./feed-http";
import { fillFeedMessage, getFeedCuisineLabel, getFeedMessages } from "./feed-messages";

type VariantWidth = (typeof photoVariantWidths)[number];
type PhotoFormat = "avif" | "webp";

function FeedPhoto({
  merchantId,
  mediaId,
  kind,
}: {
  merchantId: string;
  mediaId: string;
  kind: "cover" | "logo";
}) {
  const lowData = useLowData();
  const [hasError, setHasError] = useState(false);
  if (hasError) return null;

  const isCover = kind === "cover";
  const width = isCover ? (lowData ? 320 : 640) : 160;
  const ratio = photoRatios[kind];
  const path = `/v1/merchants/${merchantId}/profile/photos/${mediaId}/variants`;
  const photoUrl = (format: PhotoFormat, variantWidth: VariantWidth) =>
    `${path}/${format}/${variantWidth.toString()}`;
  const widths: readonly VariantWidth[] = isCover && !lowData ? [320, 640, 960] : [width];
  const srcSet = (format: PhotoFormat) =>
    widths.map((item) => `${photoUrl(format, item)} ${item.toString()}w`).join(", ");
  const sizes = isCover
    ? "(min-width: 1200px) 376px, (min-width: 960px) 33vw, (min-width: 640px) 50vw, 100vw"
    : "48px";

  return (
    <picture>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      <img
        alt=""
        src={photoUrl("webp", width)}
        srcSet={srcSet("webp")}
        sizes={sizes}
        width={width}
        height={(width * ratio.height) / ratio.width}
        loading="lazy"
        decoding="async"
        onError={() => {
          setHasError(true);
        }}
      />
    </picture>
  );
}

export function FeedPlate() {
  return (
    <svg
      className="restaurant-feed-plate"
      viewBox="0 0 192 120"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="96" cy="60" r="49" />
      <circle cx="96" cy="60" r="41" strokeDasharray="1 4" strokeLinecap="round" />
      <circle cx="96" cy="60" r="34" />
      <path d="M72 66h48m-44 1c2 9 9 15 20 15s18-6 20-15M87 59c-6-5 6-6 1-13m9 13c-6-6 6-8 1-16m9 16c-5-5 6-6 2-13M30 49v22m-11-11h22m110 0h22m-11-11v22" />
    </svg>
  );
}

function FeedAvailability({ isOpen, locale }: { isOpen: boolean; locale: Locale }) {
  const messages = getFeedMessages(locale);
  return (
    <span className="restaurant-feed-badge" data-open={isOpen}>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        {isOpen ? (
          <path d="m3.5 8 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <circle cx="8" cy="8" r="5.5" />
            <path d="M8 5v3l2 1" strokeLinecap="round" />
          </>
        )}
      </svg>
      {isOpen ? messages.open : messages.closed}
    </span>
  );
}

function FeedOpening({ opensAt, locale }: { opensAt: string; locale: Locale }) {
  const date = new Date(opensAt);
  const messages = getFeedMessages(locale);
  return (
    <p className="restaurant-feed-opening">
      {messages.opensAt}{" "}
      <time dateTime={opensAt}>
        {formatAlgiersDate(date, locale)}
        {messages.openingTimeSeparator}
        <bdi>{formatAlgiersTime(date, locale)}</bdi>
      </time>
    </p>
  );
}

function FavouriteButton({
  merchantId,
  name,
  locale,
}: {
  merchantId: string;
  name: string;
  locale: Locale;
}) {
  const messages = getFeedMessages(locale);
  const [isFavourite, setFavourite] = useState(false);
  const [hasBurst, setBurst] = useState(false);
  useEffect(() => {
    try {
      setFavourite(readFavourites(window.localStorage).has(merchantId));
    } catch {
      // Storage can be blocked; the heart still works for this visit.
    }
  }, [merchantId]);
  return (
    <button
      type="button"
      className="restaurant-feed-favourite"
      aria-pressed={isFavourite}
      data-burst={hasBurst}
      aria-label={fillFeedMessage(isFavourite ? messages.favouriteRemove : messages.favouriteAdd, {
        name,
      })}
      onClick={() => {
        let next = !isFavourite;
        try {
          next = toggleFavourite(window.localStorage, merchantId);
        } catch {
          // Keep the in-memory choice.
        }
        setFavourite(next);
        setBurst(next);
      }}
      onAnimationEnd={() => {
        setBurst(false);
      }}
    >
      <Icon name="heart" size={20} />
    </button>
  );
}

function ratingFormat(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-DZ-u-nu-latn" : locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function RatingItem({ rating, count, locale }: { rating: number; count: number; locale: Locale }) {
  const messages = getFeedMessages(locale);
  const value = ratingFormat(locale).format(rating);
  return (
    <li
      className="restaurant-feed-rating"
      aria-label={fillFeedMessage(messages.ratingLabel, { rating: value, count: String(count) })}
    >
      <Icon name="star" size={16} />
      <bdi aria-hidden="true">{value}</bdi>
      <span aria-hidden="true" className="restaurant-feed-count">
        {fillFeedMessage(messages.ratingCount, { count: String(count) })}
      </span>
    </li>
  );
}

function FeeItem({ feeDzd, locale }: { feeDzd: number; locale: Locale }) {
  const messages = getFeedMessages(locale);
  return (
    <li data-free={feeDzd === 0}>
      <Icon name="bike" size={16} />
      <span className="ui-visually-hidden">{messages.feeLabel}</span>
      {feeDzd === 0 ? messages.free : <bdi>{formatDzd(feeDzd, locale)}</bdi>}
    </li>
  );
}

function FeedMeta({ restaurant, locale }: { restaurant: FeedRestaurant; locale: Locale }) {
  const messages = getFeedMessages(locale);
  const { rating, ratingCount, etaMinutes, deliveryFeeDzd } = restaurant;
  const hasAny =
    typeof rating === "number" || Boolean(etaMinutes) || typeof deliveryFeeDzd === "number";
  if (!hasAny) return null;
  return (
    <ul className="restaurant-feed-meta" role="list">
      {typeof rating === "number" && (
        <RatingItem rating={rating} count={ratingCount ?? 0} locale={locale} />
      )}
      {etaMinutes && (
        <li>
          <Icon name="clock" size={16} />
          <bdi>
            {fillFeedMessage(messages.etaRange, {
              min: String(etaMinutes.min),
              max: String(etaMinutes.max),
            })}
          </bdi>
        </li>
      )}
      {typeof deliveryFeeDzd === "number" && <FeeItem feeDzd={deliveryFeeDzd} locale={locale} />}
    </ul>
  );
}

export function FeedCard({ restaurant, locale }: { restaurant: FeedRestaurant; locale: Locale }) {
  const { name, merchantId, coverMediaId, logoMediaId, cuisines, isOpen, nextOpensAt } = restaurant;
  const cuisineLabels = new Set(cuisines.map((cuisine) => getFeedCuisineLabel(locale, cuisine)));
  return (
    <article className="restaurant-feed-card">
      <div className="restaurant-feed-cover" data-cuisine={cuisines[0]}>
        <FeedPlate />
        {coverMediaId && (
          <FeedPhoto
            key={coverMediaId}
            merchantId={merchantId}
            mediaId={coverMediaId}
            kind="cover"
          />
        )}
        <FeedAvailability isOpen={isOpen} locale={locale} />
        <FavouriteButton merchantId={merchantId} name={name} locale={locale} />
      </div>
      <div className="restaurant-feed-card-body">
        <div className="restaurant-feed-identity">
          <div className="restaurant-feed-logo" aria-hidden="true">
            <bdi>{Array.from(name.trim())[0]?.toLocaleUpperCase(locale)}</bdi>
            {logoMediaId && (
              <FeedPhoto
                key={logoMediaId}
                merchantId={merchantId}
                mediaId={logoMediaId}
                kind="logo"
              />
            )}
          </div>
          <h3 tabIndex={-1}>
            <a href={`/${locale}/restaurants/${encodeURIComponent(restaurant.slug)}`}>
              <bdi>{name}</bdi>
            </a>
          </h3>
        </div>
        <ul className="restaurant-feed-cuisines" role="list">
          {[...cuisineLabels].map((label) => (
            <li key={label}>
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path
                  d="M3 2v4a2 2 0 0 0 4 0V2M5 2v12m7-12c-1 0-2 2-2 4v3h2m0-7v12"
                  strokeLinecap="round"
                />
              </svg>
              <bdi>{label}</bdi>
            </li>
          ))}
        </ul>
        <FeedMeta restaurant={restaurant} locale={locale} />
        {!isOpen && nextOpensAt && <FeedOpening opensAt={nextOpensAt} locale={locale} />}
      </div>
    </article>
  );
}
