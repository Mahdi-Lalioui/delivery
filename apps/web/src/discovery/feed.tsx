"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { FeedContent } from "./feed-content";
import { FeedFilterBar } from "./feed-filters";
import { filtersFromSearch, filtersToSearch } from "./filter-state";
import { readDiscoveryFeed, type FeedFilters, type FeedState } from "./feed-http";
import { Collections, CuisineChips, FavouritesRail, FeedRail } from "./feed-sections";
import { getFeedMessages } from "./feed-messages";
import "./feed.css";

const initialState: FeedState = { phase: "loading", restaurants: [], nextCursor: null };

export function DiscoveryFeed({
  locale,
  communeId = null,
  locationReady = true,
}: {
  locale: Locale;
  communeId?: string | null;
  locationReady?: boolean;
}) {
  const [state, setState] = useState(initialState);
  const [filters, setFilters] = useState<FeedFilters>({});
  const filtersRef = useRef(filters);

  // Filters live in the URL (shareable, survive reloads); the landing links here with ?cuisine=.
  useEffect(() => {
    const fromUrl = filtersFromSearch(window.location.search);
    if (Object.keys(fromUrl).length === 0) return;
    filtersRef.current = fromUrl;
    setFilters(fromUrl);
    setState(initialState);
  }, []);
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const focusRestaurant = useRef<string | null>(null);
  const focusTrigger = useRef<HTMLButtonElement | null>(null);
  const messages = getFeedMessages(locale);

  useEffect(() => {
    if (!locationReady || (state.phase !== "loading" && state.phase !== "retrying")) return;

    const controller = new AbortController();
    async function load() {
      const page = await readDiscoveryFeed(state.nextCursor, controller.signal, {
        ...filtersRef.current,
        ...(communeId === null ? {} : { communeId }),
      });
      if (controller.signal.aborted) return;
      if (page === null || (page.nextCursor !== null && page.nextCursor === state.nextCursor)) {
        setState({ ...state, phase: "error" });
        return;
      }
      const previousIds = new Set(state.restaurants.map(({ merchantId }) => merchantId));
      const newRestaurants = page.restaurants.filter(({ merchantId }) => {
        if (previousIds.has(merchantId)) return false;
        previousIds.add(merchantId);
        return true;
      });
      focusRestaurant.current = newRestaurants[0]?.merchantId ?? null;
      setState({
        phase: "ready",
        restaurants: [...state.restaurants, ...newRestaurants],
        nextCursor: page.nextCursor,
      });
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [communeId, locationReady, state]);

  useEffect(() => {
    if (state.phase !== "ready") return;
    const trigger = focusTrigger.current;
    focusTrigger.current = null;
    const root = section.current;
    if (!root || !trigger) return;

    // Leave the user's focus alone if they moved elsewhere while the request ran.
    const active = document.activeElement;
    if (active !== trigger && (active !== document.body || trigger.isConnected)) return;

    const firstAdded = focusRestaurant.current;
    const target = firstAdded ? `[data-feed-restaurant="${firstAdded}"] h3` : "h2";
    root.querySelector<HTMLElement>(target)?.focus();
  }, [state]);

  function loadNext(event: MouseEvent<HTMLButtonElement>) {
    if (state.phase === "loading" || state.phase === "retrying") return;
    const button = event.currentTarget;
    focusTrigger.current = button === document.activeElement ? button : null;
    setState({ ...state, phase: state.phase === "error" ? "retrying" : "loading" });
  }

  function changeFilters(next: FeedFilters) {
    filtersRef.current = next;
    setFilters(next);
    const url = new URL(window.location.href);
    url.search = filtersToSearch(url.search, next);
    window.history.replaceState(window.history.state, "", url);
    setState(initialState);
  }

  function chooseCuisine(cuisine: string | undefined) {
    const rest = Object.fromEntries(
      Object.entries(filtersRef.current).filter(([key]) => key !== "cuisine"),
    );
    changeFilters(cuisine === undefined ? rest : { ...rest, cuisine });
    section.current?.scrollIntoView({ block: "start" });
  }

  const location = communeId === null ? {} : { communeId };
  return (
    <>
      <Collections locale={locale} onChoose={chooseCuisine} />
      <CuisineChips locale={locale} value={filters.cuisine} onChange={chooseCuisine} />
      <section className="restaurant-feed" aria-labelledby={headingId} ref={section}>
        <header className="restaurant-feed-header">
          <h2 id={headingId} tabIndex={-1}>
            {messages.heading}
          </h2>
          <FeedFilterBar locale={locale} filters={filters} onChange={changeFilters} />
        </header>
        {Object.keys(filters).length === 0 && (
          <div className="discovery-curated">
            <FavouritesRail locale={locale} communeId={communeId} enabled={locationReady} />
            {communeId !== null && (
              <FeedRail
                locale={locale}
                title={messages.nearby}
                filters={{ ...location, sort: "distance" }}
              />
            )}
            <FeedRail
              locale={locale}
              title={messages.topRated}
              filters={{ ...location, sort: "rating" }}
              enabled={locationReady}
            />
            <FeedRail
              locale={locale}
              title={messages.freeDelivery}
              filters={{ ...location, freeDelivery: "true" }}
              enabled={locationReady}
            />
            <FeedRail
              locale={locale}
              title={messages.fastest}
              filters={{ ...location, sort: "eta" }}
              enabled={locationReady}
            />
          </div>
        )}
        <FeedContent
          locale={locale}
          state={state}
          onLoad={loadNext}
          filters={filters}
          onFilters={changeFilters}
        />
      </section>
    </>
  );
}
