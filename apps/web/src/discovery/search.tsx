"use client";

import type { Locale } from "@zaafran/i18n/locales";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { searchHistoryKey } from "./search-history-key";
import { SearchIcon } from "./search-icons";
import { getSearchMessages } from "./search-messages";
import { searchFromUrl, searchUrl } from "./search-url";
import "./search.css";

type SearchHistory = string[] | null;

// Search results, schemas and history ship only when search opens; reaching for the
// field (hover, focus, touch) starts the download so the tap rarely waits.
const loadDialog = () => import("./search-dialog");
const SearchDialog = dynamic(() => loadDialog().then((module) => module.SearchDialog), {
  ssr: false,
});

function preloadDialog() {
  void loadDialog();
}

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
        onPointerEnter={preloadDialog}
        onPointerDown={preloadDialog}
        onFocus={preloadDialog}
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
