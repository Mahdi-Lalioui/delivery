import type { Locale } from "@zaafran/i18n/locales";
import { useEffect, useId, useRef, useState } from "react";
import type { Commune } from "../merchant/merchant-http";
import { CommunePicker } from "./commune-picker";
import {
  canConfirmLocation,
  readBrowserLocation,
  resolveLocation,
  type LocationDraft,
  type SavedDiscoveryLocation,
} from "./location";
import { getDiscoveryMessages, type DiscoveryMessages } from "./messages";

export function LocationDialog({
  locale,
  onConfirm,
  onDismiss,
}: {
  locale: Locale;
  onConfirm: (location: SavedDiscoveryLocation) => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const request = useRef<AbortController | null>(null);
  const gpsAttempt = useRef(0);
  const messages = getDiscoveryMessages(locale);
  const [communes, setCommunes] = useState<readonly Commune[]>([]);
  const [draft, setDraft] = useState<LocationDraft | null>(null);
  const [gps, setGps] = useState<"idle" | "pending" | "error">("idle");
  const [save, setSave] = useState<"idle" | "pending" | "error">("idle");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();

    return () => {
      request.current?.abort();
      gpsAttempt.current += 1;
    };
  }, []);

  function pickCommune(commune: Commune) {
    gpsAttempt.current += 1;
    setGps("idle");
    setSave("idle");
    setDraft({ input: { kind: "commune", communeId: commune.id }, accuracy: null });
  }

  async function locate() {
    const attempt = ++gpsAttempt.current;
    setGps("pending");
    setSave("idle");
    const fix = await readBrowserLocation(navigator.geolocation);
    if (attempt !== gpsAttempt.current) return;
    if (!fix) {
      setGps("error");
      return;
    }
    setDraft(fix);
    setGps("idle");
  }

  async function confirm() {
    const element = dialog.current;
    if (!element || !canConfirmLocation(draft) || request.current || gps === "pending") return;

    const current = new AbortController();
    request.current = current;
    setSave("pending");
    const signal = AbortSignal.any([current.signal, AbortSignal.timeout(15_000)]);
    const location = await resolveLocation(draft.input, signal);
    if (current.signal.aborted || !element.open) return;

    request.current = null;
    if (!location || signal.aborted) {
      setSave("error");
      return;
    }

    const commune = communes.find((item) => item.id === location.communeId);
    onConfirm({
      location,
      commune: commune ? { nameAr: commune.nameAr, nameFr: commune.nameFr } : null,
    });
    element.close();
  }

  return (
    <dialog
      ref={dialog}
      className="discovery-location-dialog"
      aria-labelledby={titleId}
      onClose={onDismiss}
    >
      <div className="discovery-location-dialog-header">
        <div>
          <h2 id={titleId}>{messages.heading}</h2>
          <p>{messages.intro}</p>
        </div>
        <button
          type="button"
          className="discovery-location-close"
          aria-label={messages.close}
          onClick={() => dialog.current?.close()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="discovery-location-dialog-body">
        <fieldset className="discovery-location-gps" disabled={save === "pending"}>
          <button
            type="button"
            className="discovery-location-secondary"
            onClick={() => void locate()}
            disabled={gps === "pending"}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
            {messages.gps}
          </button>
          <GpsStatus {...{ gps, draft, locale, messages }} />
        </fieldset>
        <CommunePicker
          {...{ locale, messages }}
          selectedId={draft?.input.kind === "commune" ? draft.input.communeId : undefined}
          isDisabled={save === "pending"}
          onPick={pickCommune}
          onSearch={() => {
            if (draft?.input.kind === "commune") setDraft(null);
          }}
          onLoad={setCommunes}
        />
      </div>
      <div className="discovery-location-dialog-footer">
        {save === "error" && <p role="alert">{messages.saveError}</p>}
        {save === "pending" && <p role="status">{messages.checking}</p>}
        <button
          type="button"
          className="discovery-location-primary"
          disabled={!canConfirmLocation(draft) || save === "pending" || gps === "pending"}
          onClick={() => void confirm()}
        >
          {messages.save}
        </button>
      </div>
    </dialog>
  );
}

function GpsStatus({
  gps,
  draft,
  locale,
  messages,
}: {
  gps: "idle" | "pending" | "error";
  draft: LocationDraft | null;
  locale: Locale;
  messages: DiscoveryMessages;
}) {
  if (gps === "pending") return <p role="status">{messages.gpsPending}</p>;
  if (gps === "error") return <p role="alert">{messages.gpsError}</p>;
  if (draft?.accuracy == null) return null;
  const accuracy = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "meter",
    maximumFractionDigits: 0,
  }).format(Math.ceil(draft.accuracy));
  const accuracyValue = `±${accuracy}`;
  return (
    <div role="status" className="discovery-location-gps-status">
      <p>
        {messages.gpsReady}{" "}
        <span title={messages.accuracy}>
          <bdi>{accuracyValue}</bdi>
        </span>
      </p>
      {draft.accuracy > 40 && <p>{messages.refineWithoutMap}</p>}
    </div>
  );
}
