import type { Locale } from "@zaafran/i18n/locales";
import type { MouseEventHandler } from "react";
import { FeedCard, FeedPlate } from "./feed-card";
import type { FeedState } from "./feed-http";
import { getFeedMessages } from "./feed-messages";

function FeedSkeleton() {
  return (
    <div className="restaurant-feed-grid restaurant-feed-skeletons" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="restaurant-feed-card restaurant-feed-skeleton">
          <div className="restaurant-feed-cover" />
          <div className="restaurant-feed-card-body">
            <div className="restaurant-feed-skeleton-title" />
            <div className="restaurant-feed-skeleton-chip" />
          </div>
        </div>
      ))}
    </div>
  );
}

type ContentProps = {
  locale: Locale;
  state: FeedState;
  onLoad: MouseEventHandler<HTMLButtonElement>;
};

function FeedActions({ locale, state, onLoad }: ContentProps) {
  const { restaurants, phase, nextCursor } = state;
  const messages = getFeedMessages(locale);
  const hasError = phase === "error";
  const isRetrying = phase === "retrying";
  if (!hasError && !isRetrying && !nextCursor) return null;

  return (
    <div className="restaurant-feed-actions">
      {hasError && (
        <p role="alert">{restaurants.length > 0 ? messages.pageError : messages.error}</p>
      )}
      <button
        className="restaurant-feed-button"
        type="button"
        aria-disabled={isRetrying || phase === "loading"}
        onClick={onLoad}
      >
        {hasError || isRetrying ? messages.retry : messages.loadMore}
      </button>
    </div>
  );
}

export function FeedContent({ locale, state, onLoad }: ContentProps) {
  const { restaurants, phase } = state;
  const messages = getFeedMessages(locale);
  const hasRestaurants = restaurants.length > 0;
  const isLoading = phase === "loading" || phase === "retrying";

  return (
    <>
      <p className="restaurant-feed-announcement" role="status">
        {isLoading && (hasRestaurants ? messages.loadingMore : messages.loading)}
      </p>
      {hasRestaurants && (
        <ul className="restaurant-feed-grid" role="list">
          {restaurants.map((restaurant) => (
            <li key={restaurant.merchantId} data-feed-restaurant={restaurant.merchantId}>
              <FeedCard restaurant={restaurant} locale={locale} />
            </li>
          ))}
        </ul>
      )}
      {!hasRestaurants && isLoading && <FeedSkeleton />}
      {!hasRestaurants && phase === "ready" && (
        <div className="restaurant-feed-empty">
          <FeedPlate />
          <p>{messages.empty}</p>
        </div>
      )}
      <FeedActions locale={locale} state={state} onLoad={onLoad} />
    </>
  );
}
