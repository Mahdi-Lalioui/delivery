"use client";

import { publicSearchQuery } from "@zaafran/contracts/search";
import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SearchContent } from "./search-content";
import { addRecentSearch, readRecentSearches, searchHistoryKey } from "./search-history";
import { scheduleDiscoverySearch, type SearchPage } from "./search-http";
import { getSearchMessages } from "./search-messages";
import { searchFromUrl, searchUrl } from "./search-url";
import "./search.css";

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.2 15.2 4.3 4.3" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function storedHistory() {
  try {
    return readRecentSearches(window.localStorage.getItem(searchHistoryKey));
  } catch {
    return [];
  }
}

type SearchHistory = string[] | null;

export function DiscoverySearch({ locale }: { locale: Locale }) {
  const [isOpen, setOpen] = useState(false);
  const [history, setHistory] = useState<SearchHistory>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { trigger: label } = getSearchMessages(locale);

  useEffect(() => {
    if (history === null) return;
    try {
      if (history.length === 0) window.localStorage.removeItem(searchHistoryKey);
      else window.localStorage.setItem(searchHistoryKey, JSON.stringify(history));
    } catch {
      // History remains usable for this visit when storage is unavailable.
    }
  }, [history]);

  const [initialQuery, setInitialQuery] = useState("");

  // True while search sits on a history entry we pushed, so closing it can step back over it.
  const pushed = useRef(false);

  function show(isTap: boolean, query: string) {
    if (history === null) setHistory(storedHistory());
    setInitialQuery(query);
    const url = searchUrl(window.location.href, { isOpen: true, query });
    pushed.current = isTap;
    if (isTap) window.history.pushState(window.history.state, "", url);
    else window.history.replaceState(window.history.state, "", url);
    setOpen(true);
  }

  function restoreFocus() {
    window.requestAnimationFrame(() => {
      trigger.current?.focus();
    });
  }

  // A shared or reloaded address (and the Search tab's ?search=open) opens search in place.
  useEffect(() => {
    const requested = searchFromUrl(window.location.href);
    if (requested.isOpen) show(false, requested.query);
    // Runs once on arrival; `show` only reads state that is still empty here.
  }, []);

  // The phone's Back button closes search instead of leaving the page.
  useEffect(() => {
    if (!isOpen) return;
    const onBack = () => {
      if (searchFromUrl(window.location.href).isOpen) return;
      pushed.current = false;
      setOpen(false);
      restoreFocus();
    };
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("popstate", onBack);
    };
  }, [isOpen]);

  function dismiss() {
    setOpen(false);
    restoreFocus();
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
      return;
    }
    const url = searchUrl(window.location.href, { isOpen: false });
    if (url !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        aria-haspopup="dialog"
        className="discovery-search-trigger"
        onClick={() => {
          show(true, "");
        }}
      >
        <span className="discovery-search-trigger-icon">
          <SearchIcon />
        </span>
        <span>{label}</span>
      </button>
      {isOpen && (
        <SearchDialog {...{ locale, history, setHistory, initialQuery }} onDismiss={dismiss} />
      )}
    </>
  );
}

function SearchDialog({
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
      <div className="discovery-search-header">
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
