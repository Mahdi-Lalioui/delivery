"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { useEffect, useId, useState } from "react";
import { readFavourites } from "./favourites";
import { FeedCard } from "./feed-card";
import { readDiscoveryFeed, type FeedFilters, type FeedRestaurant } from "./feed-http";
import { getFeedMessages } from "./feed-messages";

/** Brand photos for the cuisine chips (credited in docs/PHOTO_CREDITS.md). */
const cuisinePhotos = [
  ["algerian", "couscous"],
  ["grill", "brochettes"],
  ["sandwiches", "karantika-sandwich"],
  ["pizza", "pizza"],
  ["pastry", "baklawa"],
  ["bakery", "msemen"],
] as const;

function photoSrc(name: string, isSmall = true) {
  return `/preview-catalog/${name}${isSmall ? "-320" : ""}.webp`;
}

export function CuisineChips({
  locale,
  value,
  onChange,
}: {
  locale: Locale;
  value: string | undefined;
  onChange: (cuisine: string | undefined) => void;
}) {
  const messages = getFeedMessages(locale);
  const headingId = useId();
  const chips = [[undefined, undefined] as const, ...cuisinePhotos];
  return (
    <section className="discovery-cuisines" aria-labelledby={headingId}>
      <h2 id={headingId} className="discovery-section-title">
        {messages.cuisinesTitle}
      </h2>
      <ul className="discovery-cuisine-list" role="list">
        {chips.map(([cuisine, photo]) => (
          <li key={cuisine ?? "all"}>
            <button
              type="button"
              className="discovery-cuisine"
              aria-pressed={value === cuisine}
              onClick={() => {
                onChange(cuisine);
              }}
            >
              {photo === undefined ? (
                <span className="discovery-cuisine-all" aria-hidden="true">
                  <Icon name="plate" size={26} />
                </span>
              ) : (
                <img src={photoSrc(photo)} alt="" width="64" height="64" loading="lazy" />
              )}
              <span>
                {cuisine === undefined ? messages.allCuisines : messages.chipNames[cuisine]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Collections({
  locale,
  onChoose,
}: {
  locale: Locale;
  onChoose: (cuisine: string) => void;
}) {
  const messages = getFeedMessages(locale);
  const headingId = useId();
  return (
    <section className="discovery-collections" aria-labelledby={headingId}>
      <h2 id={headingId} className="ui-visually-hidden">
        {messages.collectionsTitle}
      </h2>
      <ul className="discovery-rail-list" role="list">
        {messages.collections.map((collection) => (
          <li key={collection.cuisine}>
            <button
              type="button"
              className="discovery-collection"
              onClick={() => {
                onChoose(collection.cuisine);
              }}
            >
              <img
                src={photoSrc(collection.photo, false)}
                alt=""
                width="640"
                height="400"
                loading="lazy"
              />
              <span className="discovery-collection-text">
                <span className="discovery-collection-title">{collection.title}</span>
                <span>{collection.body}</span>
              </span>
              <span className="discovery-collection-arrow" aria-hidden="true">
                <Icon name="chevron" size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

type RailState = { phase: "loading" } | { phase: "ready"; restaurants: FeedRestaurant[] };

/** Restaurants saved with the heart on this device, in feed order; hidden when there are none. */
export function FavouritesRail({
  locale,
  communeId,
  enabled,
}: {
  locale: Locale;
  communeId: string | null;
  enabled: boolean;
}) {
  const [restaurants, setRestaurants] = useState<FeedRestaurant[]>([]);
  const headingId = useId();
  useEffect(() => {
    if (!enabled) return;
    let favourites: Set<string>;
    try {
      favourites = readFavourites(window.localStorage);
    } catch {
      return;
    }
    if (favourites.size === 0) return;
    const controller = new AbortController();
    void readDiscoveryFeed(null, controller.signal, {
      limit: "50",
      ...(communeId === null ? {} : { communeId }),
    }).then((page) => {
      if (!controller.signal.aborted && page)
        setRestaurants(page.restaurants.filter(({ merchantId }) => favourites.has(merchantId)));
    });
    return () => {
      controller.abort();
    };
  }, [communeId, enabled]);
  if (restaurants.length === 0) return null;
  const messages = getFeedMessages(locale);
  return (
    <section className="discovery-rail discovery-rail-compact" aria-labelledby={headingId}>
      <h2 id={headingId} className="discovery-section-title">
        {messages.favouritesRail}
      </h2>
      <ul className="discovery-rail-list" role="list">
        {restaurants.map((restaurant) => (
          <li key={restaurant.merchantId}>
            <FeedCard restaurant={restaurant} locale={locale} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A horizontally scrolling row of restaurants for one feed query; hidden when it has none. */
export function FeedRail({
  locale,
  title,
  filters,
  enabled = true,
}: {
  locale: Locale;
  title: string;
  filters: FeedFilters;
  enabled?: boolean;
}) {
  const [state, setState] = useState<RailState>({ phase: "loading" });
  const headingId = useId();
  const query = new URLSearchParams({ ...filters, limit: "8" }).toString();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void readDiscoveryFeed(
      null,
      controller.signal,
      Object.fromEntries(new URLSearchParams(query)),
    ).then((page) => {
      if (!controller.signal.aborted)
        setState({ phase: "ready", restaurants: page?.restaurants ?? [] });
    });
    return () => {
      controller.abort();
    };
  }, [enabled, query]);
  if (state.phase === "ready" && state.restaurants.length === 0) return null;
  return (
    <section
      className="discovery-rail"
      aria-labelledby={headingId}
      aria-busy={state.phase === "loading"}
    >
      <h2 id={headingId} className="discovery-section-title">
        {title}
      </h2>
      <ul className="discovery-rail-list" role="list">
        {state.phase === "loading"
          ? [0, 1, 2].map((index) => (
              <li key={index} aria-hidden="true">
                <div className="restaurant-feed-card restaurant-feed-skeleton">
                  <div className="restaurant-feed-cover" />
                  <div className="restaurant-feed-card-body">
                    <div className="restaurant-feed-skeleton-title" />
                    <div className="restaurant-feed-skeleton-chip" />
                  </div>
                </div>
              </li>
            ))
          : state.restaurants.map((restaurant) => (
              <li key={restaurant.merchantId}>
                <FeedCard restaurant={restaurant} locale={locale} />
              </li>
            ))}
      </ul>
    </section>
  );
}
