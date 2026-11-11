"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Icon, LogoMark } from "@zaafran/ui";
import { useEffect, useState } from "react";

const labels = {
  en: {
    title: "Get the AWID app",
    body: "One tap from your home screen, even offline.",
    install: "Install",
    dismiss: "Not now",
  },
  fr: {
    title: "Installez l’app AWID",
    body: "À un geste de votre écran d’accueil, même hors ligne.",
    install: "Installer",
    dismiss: "Plus tard",
  },
  ar: {
    title: "ثبّت تطبيق أويد",
    body: "بلمسة من شاشتك الرئيسية، حتى بدون إنترنت.",
    install: "تثبيت",
    dismiss: "لاحقًا",
  },
} as const;
const dismissedKey = "awid:install-dismissed";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

function isInstallEvent(event: Event): event is InstallEvent {
  return "prompt" in event && typeof event.prompt === "function";
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(dismissedKey) === "1";
  } catch {
    return false;
  }
}

/** Offers installation when the browser allows it (Chromium's beforeinstallprompt). */
export function InstallPrompt({ locale }: { locale: Locale }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const text = locale === "ar" ? labels.ar : locale === "fr" ? labels.fr : labels.en;
  useEffect(() => {
    if (wasDismissed()) return;
    function capture(next: Event) {
      if (!isInstallEvent(next)) return;
      next.preventDefault();
      setEvent(next);
    }
    window.addEventListener("beforeinstallprompt", capture);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
    };
  }, []);
  if (event === null) return null;
  function dismiss() {
    setEvent(null);
    try {
      window.localStorage.setItem(dismissedKey, "1");
    } catch {
      // Show it again next visit.
    }
  }
  return (
    <aside className="install-prompt" aria-label={text.title}>
      <LogoMark size={48} />
      <div>
        <strong>{text.title}</strong>
        <p>{text.body}</p>
      </div>
      <button
        type="button"
        className="ui-button ui-button-primary ui-button-sm"
        onClick={() => {
          void event.prompt().finally(dismiss);
        }}
      >
        {text.install}
      </button>
      <button
        type="button"
        className="install-prompt-close"
        aria-label={text.dismiss}
        onClick={dismiss}
      >
        <Icon name="close" size={20} />
      </button>
    </aside>
  );
}
