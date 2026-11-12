import { photoRatios } from "@zaafran/contracts/media";
import { StateArt } from "../customer/state-art";
import { getLocalizedContent } from "@zaafran/i18n/content";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useState } from "react";
import { useLowData } from "./low-data";
import { FeedPlate } from "./feed-card";
import { getFeedMessages } from "./feed-messages";
import type { SearchPage } from "./search-http";
import { getSearchMessages } from "./search-messages";

type SearchState =
  { phase: "idle" | "loading" | "error" | "invalid" } | { phase: "ready"; page: SearchPage };

function SearchCover({
  merchantId,
  coverMediaId,
}: {
  merchantId: string;
  coverMediaId: string | null;
}) {
  const lowData = useLowData();
  const [hasError, setHasError] = useState(false);
  if (!coverMediaId || hasError) return null;

  const variants = `/v1/merchants/${merchantId}/profile/photos/${coverMediaId}/variants`;
  const width = lowData ? 160 : 320;
  const { cover } = photoRatios;
  return (
    <picture>
      <source type="image/avif" srcSet={`${variants}/avif/${width.toString()}`} />
      <img
        alt=""
        src={`${variants}/webp/${width.toString()}`}
        width={width}
        height={(width * cover.height) / cover.width}
        loading="lazy"
        decoding="async"
        onError={() => {
          setHasError(true);
        }}
      />
    </picture>
  );
}

function SearchResults({ locale, page }: { locale: Locale; page: SearchPage }) {
  const messages = getSearchMessages(locale);
  return (
    <div className="discovery-search-results">
      <p className="discovery-search-announcement" role="status">
        {messages.results}
      </p>
      {page.restaurants.length > 0 && (
        <div className="discovery-search-group">
          <h3>{messages.restaurants}</h3>
          <ul role="list">
            {page.restaurants.map(({ merchantId, slug, name, coverMediaId }) => (
              <li className="discovery-search-result" key={merchantId}>
                <div className="discovery-search-art" aria-hidden="true">
                  <FeedPlate />
                  <SearchCover key={coverMediaId} {...{ merchantId, coverMediaId }} />
                </div>
                <p className="discovery-search-result-name">
                  <a href={`/${locale}/restaurants/${encodeURIComponent(slug)}`}>
                    <bdi>{name}</bdi>
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {page.dishes.length > 0 && (
        <div className="discovery-search-group">
          <h3>{messages.dishes}</h3>
          <ul role="list">
            {page.dishes.map(
              ({
                itemId,
                merchantId,
                merchantSlug,
                names,
                merchantName,
                priceDzd,
                photoMediaId,
              }) => (
                <li className="discovery-search-result" key={itemId}>
                  <div className="discovery-search-art" data-dish aria-hidden="true">
                    <FeedPlate />
                    {photoMediaId !== null && (
                      <img
                        alt=""
                        width="320"
                        height="240"
                        loading="lazy"
                        src={`/v1/merchants/${merchantId}/items/${itemId}/photos/${photoMediaId}/variants/webp/320`}
                      />
                    )}
                  </div>
                  <div>
                    <p className="discovery-search-result-name">
                      <a href={`/${locale}/restaurants/${encodeURIComponent(merchantSlug)}`}>
                        <bdi>{getLocalizedContent(names, locale)}</bdi>
                      </a>
                    </p>
                    <p className="discovery-search-merchant">
                      <bdi>{merchantName}</bdi>
                    </p>
                  </div>
                  <p className="discovery-search-price">
                    <bdi>{formatDzd(priceDzd, locale)}</bdi>
                  </p>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function SearchChips({
  queries,
  onSelect,
}: {
  queries: readonly string[];
  onSelect: (query: string) => void;
}) {
  return (
    <ul className="discovery-search-chips" role="list">
      {queries.map((query) => (
        <li key={query}>
          <button
            type="button"
            onClick={() => {
              onSelect(query);
            }}
          >
            <bdi>{query}</bdi>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SearchContent({
  locale,
  state,
  history,
  onSelect,
  onClear,
  onRetry,
}: {
  locale: Locale;
  state: SearchState;
  history: readonly string[];
  onSelect: (query: string) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const messages = getSearchMessages(locale);
  if (state.phase === "loading") {
    return (
      <div className="discovery-search-feedback" role="status">
        <p>{messages.loading}</p>
        <div className="discovery-search-skeleton" aria-hidden="true" />
        <div className="discovery-search-skeleton" aria-hidden="true" />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="discovery-search-feedback">
        <p role="alert">{messages.error}</p>
        <button type="button" className="discovery-search-secondary" onClick={onRetry}>
          {messages.retry}
        </button>
      </div>
    );
  }
  if (state.phase === "invalid") return <p role="alert">{messages.invalid}</p>;
  if (
    state.phase === "ready" &&
    (state.page.restaurants.length > 0 || state.page.dishes.length > 0)
  ) {
    return <SearchResults locale={locale} page={state.page} />;
  }
  return (
    <div className="discovery-search-prompts">
      {state.phase === "ready" && (
        <div className="discovery-search-empty" role="status">
          <StateArt kind="search" />
          <p>{messages.empty}</p>
        </div>
      )}
      {state.phase === "idle" && history.length > 0 && (
        <div className="discovery-search-group">
          <div className="discovery-search-history-heading">
            <h3>{messages.recent}</h3>
            <button type="button" className="discovery-search-clear-history" onClick={onClear}>
              {messages.clearHistory}
            </button>
          </div>
          <SearchChips queries={history} onSelect={onSelect} />
        </div>
      )}
      <div className="discovery-search-group">
        <h3>{messages.suggestions}</h3>
        <SearchChips queries={messages.suggestedQueries} onSelect={onSelect} />
      </div>
      <BrowseCuisines locale={locale} />
    </div>
  );
}

const browseCuisines = [
  ["algerian", "couscous"],
  ["grill", "grill-plate"],
  ["sandwiches", "karantika-sandwich"],
  ["pizza", "pizza"],
  ["pastry", "baklawa-tray"],
  ["bakery", "msemen-griddle"],
] as const;

/** Before typing: browse by cuisine, with photos (each opens the filtered list). */
function BrowseCuisines({ locale }: { locale: Locale }) {
  const messages = getSearchMessages(locale);
  const feed = getFeedMessages(locale);
  return (
    <div className="discovery-search-group">
      <h3>{messages.browse}</h3>
      <ul className="discovery-search-browse" role="list">
        {browseCuisines.map(([cuisine, photo]) => (
          <li key={cuisine}>
            <a href={`/${locale}/discover?cuisine=${cuisine}`}>
              <img
                src={`/preview-catalog/${photo}-320.webp`}
                alt=""
                width="320"
                height="240"
                loading="lazy"
              />
              <span>{feed.chipNames[cuisine]}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
