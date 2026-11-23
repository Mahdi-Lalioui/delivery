"use client";

import { publicSearchQuery } from "@zaafran/contracts/search";
import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SearchContent } from "./search-content";
import { addRecentSearch, readRecentSearches } from "./search-history";
import { searchHistoryKey } from "./search-history-key";
import { CloseIcon, SearchIcon } from "./search-icons";
import { scheduleDiscoverySearch, type SearchPage } from "./search-http";
import { getSearchMessages } from "./search-messages";
import { searchFromUrl, searchUrl } from "./search-url";

type SearchHistory = string[] | null;

function storedHistory() {
  try {
    return readRecentSearches(window.localStorage.getItem(searchHistoryKey));
  } catch {
    return [];
  }
}

/** Loaded on demand: the schemas, results and history only ship when search opens. */
export function SearchDialog({
  locale,
  history,
  setHistory,
  initialQuery,
  onDismiss,
}: {
  locale: Locale;
  history: SearchHistory;
  setHistory: Dispatch<SetStateAction<SearchHistory>>;
  initialQuery: string;
  onDismiss: () => void;
}) {
  const messages = getSearchMessages(locale);
  const titleId = useId();
  const introId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);

  // History is read here, with the schema that checks it, rather than when the field loads.
  useEffect(() => {
    if (history === null) setHistory(storedHistory());
  }, [history, setHistory]);
  const [query, setQuery] = useState(initialQuery);
  const [settled, setSettled] = useState<{ query: string; page: SearchPage | null }>();
  const [attempt, setAttempt] = useState(0);
  const trimmed = query.trim();
  const parsed = publicSearchQuery.shape.q.safeParse(trimmed);
  const requestQuery = parsed.success ? parsed.data : null;
  const result = settled?.query === requestQuery ? settled.page : undefined;

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      field.current?.focus();
    }
  }, []);

  // The settled query lives in the address so a search can be shared or survive a reload.
  useEffect(() => {
    if (!searchFromUrl(window.location.href).isOpen) return;
    const url = searchUrl(window.location.href, { isOpen: true, query: requestQuery ?? "" });
    if (url !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [requestQuery]);

  useEffect(() => {
    if (requestQuery === null) return;
    return scheduleDiscoverySearch(requestQuery, (page) => {
      setSettled({ query: requestQuery, page });
      if (page) setHistory((current) => addRecentSearch(current ?? [], requestQuery));
    });
  }, [attempt, requestQuery, setHistory]);

  function edit(value: string) {
    if (value.trim() !== trimmed) setSettled(undefined);
    setQuery(value);
  }

  function select(value: string) {
    edit(value);
    field.current?.focus();
  }

  function retry() {
    setSettled(undefined);
    setAttempt((current) => current + 1);
    field.current?.focus();
  }

  return (
    <dialog
      ref={dialog}
      className="discovery-search-dialog"
      aria-labelledby={titleId}
      aria-describedby={introId}
      onClose={onDismiss}
    >
      <div className="discovery-search-header fanous-night decor-zellige decor-lamplight">
        <div className="discovery-search-shell">
          <div className="discovery-search-heading">
            <div className="ui-visually-hidden">
              <h2 id={titleId}>{messages.heading}</h2>
              <p id={introId}>{messages.intro}</p>
            </div>
            <button
              type="button"
              className="discovery-search-icon-button"
              aria-label={messages.close}
              onClick={() => dialog.current?.close()}
            >
              <CloseIcon />
            </button>
          </div>
          <form
            role="search"
            aria-label={messages.trigger}
            className="discovery-search-field"
            onSubmit={(event) => {
              event.preventDefault();
              if (result === null) retry();
            }}
          >
            <SearchIcon />
            <input
              ref={field}
              role="searchbox"
              inputMode="search"
              enterKeyHint="search"
              dir="auto"
              aria-label={messages.trigger}
              aria-invalid={trimmed !== "" && requestQuery === null ? true : undefined}
              placeholder={messages.trigger}
              value={query}
              maxLength={100}
              autoComplete="off"
              onChange={(event) => {
                edit(event.currentTarget.value);
              }}
            />
            {query && (
              <button
                type="button"
                className="discovery-search-icon-button"
                aria-label={messages.clearQuery}
                onClick={() => {
                  select("");
                }}
              >
                <CloseIcon />
              </button>
            )}
          </form>
        </div>
      </div>
      <div className="discovery-search-shell discovery-search-body">
        <SearchContent
          locale={locale}
          state={getSearchState(trimmed, requestQuery, result)}
          history={history ?? []}
          onSelect={select}
          onClear={() => {
            setHistory([]);
            field.current?.focus();
          }}
          onRetry={retry}
        />
      </div>
    </dialog>
  );
}

function getSearchState(
  query: string,
  requestQuery: string | null,
  page: SearchPage | null | undefined,
): Parameters<typeof SearchContent>[0]["state"] {
  if (query === "") return { phase: "idle" };
  if (requestQuery === null) return { phase: "invalid" };
  if (page === undefined) return { phase: "loading" };
  if (page === null) return { phase: "error" };
  return { phase: "ready", page };
}
