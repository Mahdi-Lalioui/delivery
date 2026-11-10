"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useSyncExternalStore } from "react";
import { FeedCard } from "./feed-card";
import type { FeedRestaurant } from "./feed-http";
import { getFeedCuisineLabel } from "./feed-messages";

const copy = {
  fr: {
    filters: "Affiner les résultats",
    all: "Toutes les cuisines",
    open: "Ouverts",
    free: "Livraison gratuite",
    quick: "35 min maximum",
    sort: "Trier",
    suggested: "À découvrir",
    rated: "Mieux notés",
    speed: "Livraison rapide",
    nearby: "À découvrir à Alger",
    recent: "Nouveautés",
    empty: "Aucun restaurant pour ces filtres.",
    clear: "Effacer les filtres",
  },
  ar: {
    filters: "تصفية النتائج",
    all: "كل المطابخ",
    open: "مفتوح الآن",
    free: "توصيل مجاني",
    quick: "35 دقيقة كحد أقصى",
    sort: "ترتيب",
    suggested: "مقترحة",
    rated: "الأعلى تقييمًا",
    speed: "أسرع توصيل",
    nearby: "اكتشف مطاعم العاصمة",
    recent: "وصلت حديثًا",
    empty: "لا توجد مطاعم تطابق هذه الفلاتر.",
    clear: "امسح الفلاتر",
  },
  en: {
    filters: "Refine results",
    all: "All cuisines",
    open: "Open now",
    free: "Free delivery",
    quick: "35 min or less",
    sort: "Sort",
    suggested: "Suggested",
    rated: "Top rated",
    speed: "Fastest delivery",
    nearby: "Discover Algiers",
    recent: "New arrivals",
    empty: "No restaurants match these filters.",
    clear: "Clear filters",
  },
};

const filterChanged = "zaafran-demo-feed";
const filterKeys = ["cuisine", "open", "free", "quick", "sort"] as const;
type FilterKey = (typeof filterKeys)[number];

function subscribe(refresh: () => void) {
  window.addEventListener(filterChanged, refresh);
  window.addEventListener("popstate", refresh);
  return () => {
    window.removeEventListener(filterChanged, refresh);
    window.removeEventListener("popstate", refresh);
  };
}

function setFilter(key?: FilterKey, value?: string) {
  const url = new URL(window.location.href);
  if (key === undefined) {
    for (const filter of filterKeys) url.searchParams.delete(filter);
  } else if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }
  window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(filterChanged));
}

function matchFilters(restaurants: readonly FeedRestaurant[], params: URLSearchParams) {
  const cuisine = params.get("cuisine");
  const maxEta = params.has("quick") ? 35 : Infinity;
  return restaurants.filter((restaurant) => {
    if (cuisine && !restaurant.cuisines.includes(cuisine)) return false;
    if (params.has("open") && !restaurant.isOpen) return false;
    if (params.has("free") && restaurant.details?.feeDzd !== 0) return false;
    return (restaurant.details?.etaMax ?? Infinity) <= maxEta;
  });
}

const byRating = (a: FeedRestaurant, b: FeedRestaurant) =>
  (b.details?.rating ?? 0) - (a.details?.rating ?? 0);
const byEta = (a: FeedRestaurant, b: FeedRestaurant) =>
  (a.details?.etaMin ?? Infinity) - (b.details?.etaMin ?? Infinity);
const noSearch = () => "";

function DemoCards({ locale, rows }: { locale: Locale; rows: readonly FeedRestaurant[] }) {
  return (
    <ul className="restaurant-feed-grid" role="list">
      {rows.map((restaurant) => (
        <li key={restaurant.merchantId} data-feed-restaurant={restaurant.merchantId}>
          <FeedCard restaurant={restaurant} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

function FilterChips({
  locale,
  cuisines,
  params,
}: {
  locale: Locale;
  cuisines: readonly string[];
  params: URLSearchParams;
}) {
  const text = copy[locale === "en-XA" ? "en" : locale];
  const toggles = ["open", "free", "quick"] as const;
  return (
    <fieldset className="demo-feed-filters">
      <legend>{text.filters}</legend>
      <div className="demo-feed-chips">
        <button
          type="button"
          aria-pressed={!params.has("cuisine")}
          onClick={() => {
            setFilter("cuisine");
          }}
        >
          {text.all}
        </button>
        {cuisines.map((cuisine) => (
          <button
            key={cuisine}
            type="button"
            aria-pressed={params.get("cuisine") === cuisine}
            onClick={() => {
              setFilter("cuisine", cuisine);
            }}
          >
            {getFeedCuisineLabel(locale, cuisine)}
          </button>
        ))}
      </div>
      <div className="demo-feed-chips">
        {toggles.map((toggle) => (
          <button
            key={toggle}
            type="button"
            aria-pressed={params.has(toggle)}
            onClick={() => {
              setFilter(toggle, params.has(toggle) ? "" : "1");
            }}
          >
            {text[toggle]}
          </button>
        ))}
        <label>
          {text.sort}
          <select
            value={params.get("sort") ?? ""}
            onChange={(event) => {
              setFilter("sort", event.target.value);
            }}
          >
            <option value="">{text.suggested}</option>
            <option value="rating">{text.rated}</option>
            <option value="eta">{text.speed}</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}

export function DemoFeed({
  locale,
  restaurants,
}: {
  locale: Locale;
  restaurants: readonly FeedRestaurant[];
}) {
  const search = useSyncExternalStore(subscribe, () => window.location.search, noSearch);
  const params = new URLSearchParams(search);
  const text = copy[locale === "en-XA" ? "en" : locale];
  const cuisines = [...new Set(restaurants.flatMap(({ cuisines }) => cuisines))];
  const matching = matchFilters(restaurants, params);
  const ranked = matching.toSorted(byRating);
  const sort = params.get("sort");
  const primary = sort === "rating" ? ranked : sort === "eta" ? matching.toSorted(byEta) : matching;
  return (
    <div className="demo-feed-collections">
      <FilterChips locale={locale} cuisines={cuisines} params={params} />
      <section>
        <h2>{text.nearby}</h2>
        {primary.length > 0 ? (
          <DemoCards locale={locale} rows={primary} />
        ) : (
          <div className="restaurant-feed-empty">
            <p>{text.empty}</p>
            <button
              className="restaurant-feed-button"
              type="button"
              onClick={() => {
                setFilter();
              }}
            >
              {text.clear}
            </button>
          </div>
        )}
      </section>
      {primary.length > 0 && (
        <>
          <section>
            <h2>{text.rated}</h2>
            <DemoCards locale={locale} rows={ranked.slice(0, 3)} />
          </section>
          <section>
            <h2>{text.recent}</h2>
            <DemoCards locale={locale} rows={matching.toReversed().slice(0, 3)} />
          </section>
        </>
      )}
    </div>
  );
}
