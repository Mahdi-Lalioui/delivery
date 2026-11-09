"use client";

import { useState } from "react";
import type { TourLocale } from "./tour-stops";

const themeLabels = {
  fr: { light: "Clair", dark: "Sombre" },
  ar: { light: "فاتح", dark: "داكن" },
};
const themes = ["light", "dark"] as const;

export function TourTheme({ locale }: { locale: TourLocale }) {
  const [theme, setTheme] = useState<(typeof themes)[number]>();
  return (
    <div className="demo-tour-switch">
      {themes.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => {
            document.documentElement.dataset.theme = value;
            setTheme(value);
          }}
        >
          {themeLabels[locale][value]}
        </button>
      ))}
    </div>
  );
}
