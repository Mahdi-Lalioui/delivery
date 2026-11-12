"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useState } from "react";
import {
  locationChangedEvent,
  readSavedLocation,
  saveLocation,
  type SavedDiscoveryLocation,
} from "./location";
import { LocationDialog } from "./location-dialog";
import { getDiscoveryMessages } from "./messages";
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
    window.dispatchEvent(new Event(locationChangedEvent));
  }

  const isOutside = saved !== null && saved.location.serviceAreaId === null;
  return (
    <section className="discovery-location">
      <LocationPill
        saved={saved}
        locale={locale}
        onOpen={() => {
          setOpen(true);
        }}
      />
      {isOutside && <p className="discovery-location-coverage">{messages.outside}</p>}
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

function LocationPill({
  saved,
  locale,
  onOpen,
}: {
  saved: SavedDiscoveryLocation | null;
  locale: Locale;
  onOpen: () => void;
}) {
  const messages = getDiscoveryMessages(locale);
  const savedName = locale === "ar" ? saved?.commune?.nameAr : saved?.commune?.nameFr;
  return (
    <button
      type="button"
      className="discovery-location-pill"
      aria-haspopup="dialog"
      aria-label={saved ? messages.change : undefined}
      onClick={onOpen}
    >
      <span className="discovery-location-emblem" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </span>
      <span className="discovery-location-text" aria-live="polite">
        <span className="discovery-location-label">
          {saved ? messages.saved : messages.heading}
        </span>
        <span className="discovery-location-value">
          {saved ? (savedName ?? messages.savedPoint) : messages.open}
        </span>
      </span>
      <svg
        className="discovery-location-chevron"
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
