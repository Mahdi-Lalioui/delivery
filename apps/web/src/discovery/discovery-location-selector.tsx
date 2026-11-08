"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useState } from "react";
import { readSavedLocation, saveLocation, type SavedDiscoveryLocation } from "./location";
import { LocationDialog } from "./location-dialog";
import { getDiscoveryMessages, type DiscoveryMessages } from "./messages";
import "./discovery-location.css";

export function DiscoveryLocationSelector({ locale }: { locale: Locale }) {
  const messages = getDiscoveryMessages(locale);
  const [saved, setSaved] = useState<SavedDiscoveryLocation | null>(null);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    try {
      setSaved(readSavedLocation(window.localStorage));
    } catch {
      // Some browsers block access to the storage object itself.
    }
  }, []);

  function confirm(location: SavedDiscoveryLocation) {
    try {
      saveLocation(window.localStorage, location);
    } catch {
      // The selector remains usable for this visit.
    }
    setSaved(location);
  }

  return (
    <section className="discovery-location">
      <div className="discovery-location-summary">
        <div className="discovery-location-emblem" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <div aria-live="polite" className="discovery-location-summary-text">
          <LocationSummary {...{ saved, locale, messages }} />
        </div>
      </div>
      <button
        type="button"
        className={saved ? "discovery-location-secondary" : "discovery-location-primary"}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        {saved ? messages.change : messages.open}
      </button>
      {isOpen && (
        <LocationDialog
          locale={locale}
          onConfirm={confirm}
          onDismiss={() => {
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

function LocationSummary({
  saved,
  locale,
  messages,
}: {
  saved: SavedDiscoveryLocation | null;
  locale: Locale;
  messages: DiscoveryMessages;
}) {
  if (!saved) {
    return (
      <>
        <h2>{messages.heading}</h2>
        <p>{messages.intro}</p>
      </>
    );
  }

  const isCovered = saved.location.serviceAreaId !== null;
  const savedName = locale === "ar" ? saved.commune?.nameAr : saved.commune?.nameFr;
  return (
    <>
      <p className="discovery-location-summary-label">{messages.saved}</p>
      <h2>{savedName ?? messages.savedPoint}</h2>
      <p className="discovery-location-coverage" data-covered={isCovered}>
        {isCovered ? messages.covered : messages.outside}
      </p>
    </>
  );
}
