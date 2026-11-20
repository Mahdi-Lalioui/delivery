import type { Locale } from "@zaafran/i18n/locales";
import type { MouseEventHandler } from "react";
import { FeedCard, FeedPlate } from "./feed-card";
import type { FeedFilters, FeedRestaurant, FeedState } from "./feed-http";
import { filterLabel, without } from "./feed-filters";
import { activeFilters } from "./filter-state";
import { fillFeedMessage, getFeedMessages } from "./feed-messages";

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
  filters?: FeedFilters;
  onFilters?: (filters: FeedFilters) => void;
};

/** No results with filters on: suggest exactly which filters to drop. */
function WidenSearch({
  locale,
  filters,
  onFilters,
}: {
  locale: Locale;
  filters: FeedFilters;
  onFilters: (filters: FeedFilters) => void;
}) {
  const messages = getFeedMessages(locale);
  return (
    <div className="restaurant-feed-empty">
      <FeedPlate />
      <p>{messages.emptyFiltered}</p>
      <p className="restaurant-feed-widen">{messages.widenHint}</p>
      <ul className="restaurant-feed-widen-list" role="list">
        {activeFilters(filters).map((filter) => (
          <li key={filter.key}>
            <button
              type="button"
              className="discovery-filter"
              onClick={() => {
                onFilters(without(filters, filter.key));
              }}
            >
              {fillFeedMessage(messages.removeFilter, { name: filterLabel(messages, filter) })}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="discovery-filter"
            aria-pressed="true"
            onClick={() => {
              onFilters({});
            }}
          >
            {messages.clearAll}
          </button>
        </li>
      </ul>
    </div>
  );
}

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

function EmptyResults({
  locale,
  filters,
  onFilters,
}: {
  locale: Locale;
  filters: FeedFilters;
  onFilters: ((filters: FeedFilters) => void) | undefined;
}) {
  const messages = getFeedMessages(locale);
  if (onFilters && activeFilters(filters).length > 0)
    return <WidenSearch locale={locale} filters={filters} onFilters={onFilters} />;
  return (
    <div className="restaurant-feed-empty">
      <FeedPlate />
      <p>{messages.empty}</p>
    </div>
  );
}

/** In pickup mode nobody pays delivery: the card shows distance and time, not a fee. */
function withoutFee(restaurant: FeedRestaurant): FeedRestaurant {
  const card = { ...restaurant };
  delete card.deliveryFeeDzd;
  return card;
}

/** The full list, ending on a closing tile once every restaurant is shown. */
function FeedGrid({
  locale,
  state,
  filters,
}: {
  locale: Locale;
  state: FeedState;
  filters: FeedFilters;
}) {
  const messages = getFeedMessages(locale);
  const { restaurants, phase } = state;
  return (
    <ul className="restaurant-feed-grid" role="list" aria-label={messages.heading}>
      {restaurants.map((restaurant) => (
        <li key={restaurant.merchantId} data-feed-restaurant={restaurant.merchantId}>
          <FeedCard
            restaurant={filters.fulfilment === "pickup" ? withoutFee(restaurant) : restaurant}
            locale={locale}
          />
        </li>
      ))}
      {phase === "ready" && state.nextCursor === null && (
        <li className="restaurant-feed-closer decor-zellige decor-lamplight">
          <p>{messages.closerTitle}</p>
          <a className="ui-button ui-button-secondary" href={`/${locale}/restaurants`}>
            {messages.closerAction}
          </a>
        </li>
      )}
    </ul>
  );
}

export function FeedContent({ locale, state, onLoad, filters = {}, onFilters }: ContentProps) {
  const { restaurants, phase } = state;
  const messages = getFeedMessages(locale);
  const hasRestaurants = restaurants.length > 0;
  const isLoading = phase === "loading" || phase === "retrying";

  return (
    <>
      <p className="restaurant-feed-announcement" role="status">
        {isLoading && (hasRestaurants ? messages.loadingMore : messages.loading)}
      </p>
      {hasRestaurants && <FeedGrid locale={locale} state={state} filters={filters} />}
      {!hasRestaurants && isLoading && <FeedSkeleton />}
      {!hasRestaurants && phase === "ready" && (
        <EmptyResults locale={locale} filters={filters} onFilters={onFilters} />
      )}
      <FeedActions locale={locale} state={state} onLoad={onLoad} />
    </>
  );
}
