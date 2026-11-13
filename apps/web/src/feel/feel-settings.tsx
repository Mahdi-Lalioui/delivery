"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import { useEffect, useState } from "react";
import { buzz, readFeel, saveFeel, type Feel } from "./feel";

/** Two switches on the Profile tab: vibration on key moments, and the accepted chime. */
export function FeelSettings({ locale }: { locale: Locale }) {
  const copy = getMessages(locale).feel;
  const [feel, setFeel] = useState<Feel | null>(null);
  useEffect(() => {
    setFeel(readFeel());
  }, []);
  if (feel === null) return null;
  function change(next: Feel) {
    saveFeel(next);
    setFeel(next);
    // Let the diner feel the setting they just turned on.
    if (next.haptics && !feel?.haptics) buzz("add");
  }
  return (
    <fieldset className="feel-settings">
      <legend>{copy.title}</legend>
      {(["haptics", "sound"] as const).map((key) => (
        <label key={key} className="feel-switch">
          <span>
            <strong>{copy[key]}</strong>
            <span>{copy[`${key}Body`]}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={feel[key]}
            onChange={(event) => {
              change({ ...feel, [key]: event.currentTarget.checked });
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}
