import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useId, useState } from "react";
import { listAlgiersCommunes, type Commune } from "../merchant/merchant-http";
import { filterCommunes } from "./location";
import type { DiscoveryMessages } from "./messages";

type ListState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; communes: Commune[] };

export function CommunePicker({
  locale,
  messages,
  selectedId,
  isDisabled,
  onPick,
  onSearch,
  onLoad,
}: {
  locale: Locale;
  messages: DiscoveryMessages;
  selectedId: string | undefined;
  isDisabled: boolean;
  onPick: (commune: Commune) => void;
  onSearch: () => void;
  onLoad: (communes: readonly Commune[]) => void;
}) {
  const queryId = useId();
  const hintId = useId();
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<ListState>({ kind: "loading" });

  useEffect(() => {
    const request = new AbortController();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
    void listAlgiersCommunes(signal).then((result) => {
      if (request.signal.aborted) return;
      if (result.kind !== "ready" || signal.aborted) {
        setList({ kind: "error" });
        return;
      }
      const getName = ({ nameAr, nameFr }: Commune) => (locale === "ar" ? nameAr : nameFr);
      const collator = new Intl.Collator(locale === "ar" ? "ar" : "fr");
      const communes = result.data.toSorted((left, right) =>
        collator.compare(getName(left), getName(right)),
      );
      onLoad(communes);
      setList({ kind: "ready", communes });
    });
    return () => {
      request.abort();
    };
  }, [attempt, locale, onLoad]);

  function retry() {
    setList({ kind: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <fieldset className="discovery-location-communes" disabled={isDisabled}>
      <legend>{messages.searchHeading}</legend>
      <label htmlFor={queryId}>{messages.search}</label>
      <input
        id={queryId}
        type="search"
        dir="auto"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          onSearch();
        }}
        aria-describedby={hintId}
        autoComplete="off"
        maxLength={120}
      />
      <p id={hintId} className="discovery-location-hint">
        {messages.searchHint}
      </p>
      <CommuneResults {...{ list, locale, messages, query, selectedId, onPick, retry }} />
    </fieldset>
  );
}

function CommuneResults({
  list,
  locale,
  messages,
  query,
  selectedId,
  onPick,
  retry,
}: {
  list: ListState;
  locale: Locale;
  messages: DiscoveryMessages;
  query: string;
  selectedId: string | undefined;
  onPick: (commune: Commune) => void;
  retry: () => void;
}) {
  if (list.kind === "loading") {
    return (
      <div role="status" className="discovery-location-list-loading">
        <p>{messages.loading}</p>
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
    );
  }

  if (list.kind === "error") {
    return (
      <div className="discovery-location-list-error">
        <p role="alert">{messages.listError}</p>
        <button type="button" className="discovery-location-secondary" onClick={retry}>
          {messages.retry}
        </button>
      </div>
    );
  }

  const matches = filterCommunes(list.communes, query);
  if (!matches.length) return <p role="status">{messages.empty}</p>;

  return (
    <div className="discovery-location-choices" role="radiogroup" aria-label={messages.communeList}>
      {matches.map((commune) => (
        <label key={commune.id} className="discovery-location-choice">
          <input
            type="radio"
            name="discovery-commune"
            checked={commune.id === selectedId}
            onChange={() => {
              onPick(commune);
            }}
          />
          <span lang={locale === "ar" ? "ar" : "fr"}>
            {locale === "ar" ? commune.nameAr : commune.nameFr}
          </span>
        </label>
      ))}
    </div>
  );
}
