"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { FeedContent } from "./feed-content";
import { readDiscoveryFeed, type FeedState } from "./feed-http";
import { getFeedMessages } from "./feed-messages";
import "./feed.css";

const initialState: FeedState = { phase: "loading", restaurants: [], nextCursor: null };

export function DiscoveryFeed({ locale }: { locale: Locale }) {
  const [state, setState] = useState(initialState);
  const headingId = useId();
  const section = useRef<HTMLElement>(null);
  const focusRestaurant = useRef<string | null>(null);
  const focusTrigger = useRef<HTMLButtonElement | null>(null);
  const messages = getFeedMessages(locale);

  useEffect(() => {
    if (state.phase !== "loading" && state.phase !== "retrying") return;

    const controller = new AbortController();
    async function load() {
      const page = await readDiscoveryFeed(state.nextCursor, controller.signal);
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
  }, [state]);

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

  return (
    <section className="restaurant-feed" aria-labelledby={headingId} ref={section}>
      <header className="restaurant-feed-header">
        <p className="eyebrow">{messages.eyebrow}</p>
        <h2 id={headingId} tabIndex={-1}>
          {messages.heading}
        </h2>
      </header>
      <FeedContent locale={locale} state={state} onLoad={loadNext} />
    </section>
  );
}
