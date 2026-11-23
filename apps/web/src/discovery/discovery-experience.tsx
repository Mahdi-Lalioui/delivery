"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useState } from "react";
import { DiscoveryLocationSelector } from "./discovery-location-selector";
import { DiscoveryFeed } from "./feed";
import { getFeedMessages } from "./feed-messages";
import { readSavedLocation, saveLocation, type SavedDiscoveryLocation } from "./location";
import { DiscoverySearch } from "./search";

export function DiscoveryExperience({ locale }: { locale: Locale }) {
  const [saved, setSaved] = useState<SavedDiscoveryLocation | null>();
  const communeId = saved?.location.communeId ?? null;
  const messages = getFeedMessages(locale);

  useEffect(() => {
    let isCurrent = true;
    const read = (() => {
      try {
        return readSavedLocation(window.localStorage);
      } catch {
        return Promise.resolve(null);
      }
    })();
    void read.then((value) => {
      if (isCurrent) setSaved(value);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  function confirm(location: SavedDiscoveryLocation) {
    try {
      saveLocation(window.localStorage, location);
    } catch {
      // The confirmed location remains available for this visit.
    }
    setSaved(location);
  }

  return (
    <>
      <section className="discover-top" aria-labelledby="discover-title">
        <DiscoveryLocationSelector locale={locale} saved={saved ?? null} onConfirm={confirm} />
        <div className="discover-greeting">
          <h1 id="discover-title">{messages.greeting}</h1>
          <p>{messages.greetingIntro}</p>
        </div>
        <DiscoverySearch locale={locale} />
      </section>
      <DiscoveryFeed
        key={communeId ?? "global"}
        locale={locale}
        communeId={communeId}
        locationReady={saved !== undefined}
      />
    </>
  );
}
