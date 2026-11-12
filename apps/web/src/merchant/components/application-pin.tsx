"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { readBrowserLocation, resolveLocation } from "../../discovery/location";
import type { MapPoint } from "../../maps/algeria-map-style";
import { AlgeriaMap } from "../../maps/algeria-map";
import type { MerchantApplicationState } from "../use-merchant-application";

type GpsFix = NonNullable<Awaited<ReturnType<typeof readBrowserLocation>>>;

function useCommuneCenter(communeId: string) {
  const [center, setCenter] = useState<MapPoint>();
  useEffect(() => {
    if (!communeId) return;
    const request = new AbortController();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]);
    void resolveLocation({ kind: "commune", communeId }, signal).then((result) => {
      if (result && !signal.aborted) setCenter(result);
    });
    return () => {
      request.abort();
    };
  }, [communeId]);
  return center;
}

function pinDescription(isInvalid: boolean, isOutside: boolean) {
  const messages = ["merchant-pin-hint"];
  if (isInvalid) messages.push("merchant-pin-error");
  if (isOutside) messages.push("merchant-application-error");
  return messages.join(" ");
}

export function ApplicationPinFields({
  state,
  locale,
  onLocatingChange,
}: {
  state: MerchantApplicationState;
  locale: Locale;
  onLocatingChange: (locating: boolean) => void;
}) {
  const t = useTranslations("merchant");
  const initial = useCommuneCenter(state.draft.communeId);
  const [selection, setSelection] = useState<MapPoint>();
  const [fix, setFix] = useState<GpsFix>();
  const [gps, setGps] = useState<"idle" | "locating" | "unavailable">("idle");
  const request = useRef(0);

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  function save(point: MapPoint) {
    state.update({ latitude: String(point.latitude), longitude: String(point.longitude) });
  }

  async function locate() {
    const current = ++request.current;
    setGps("locating");
    onLocatingChange(true);
    const result = await readBrowserLocation(navigator.geolocation);
    if (current !== request.current) return;
    onLocatingChange(false);
    if (!result) {
      setGps("unavailable");
      return;
    }
    setGps("idle");
    setSelection(undefined);
    setFix(result);
    if (result.accuracy <= 40) save(result.input);
    else state.update({ latitude: "", longitude: "" });
  }

  const isInvalid = state.fields.includes("latitude") || state.fields.includes("longitude");
  const isOutside = state.error === "outsideCommune";

  return (
    <fieldset
      className="merchant-group"
      name="latitude"
      tabIndex={-1}
      aria-describedby={pinDescription(isInvalid, isOutside)}
      aria-invalid={isInvalid || isOutside}
    >
      <legend>{t("pin")}</legend>
      <p id="merchant-pin-hint" className="merchant-hint">
        {t("pinHint")}
      </p>
      <button
        type="button"
        className="merchant-secondary"
        disabled={gps === "locating"}
        onClick={() => void locate()}
      >
        {t(gps === "locating" ? "locating" : "useLocation")}
      </button>
      <AlgeriaMap
        locale={locale}
        initial={initial}
        selected={selection ?? fix?.input}
        accuracy={fix?.accuracy}
        onSelect={(point) => {
          request.current += 1;
          onLocatingChange(false);
          setGps("idle");
          setFix(undefined);
          setSelection(point);
          save(point);
        }}
      />
      <PinStatus {...{ isInvalid, gps, fix, confirmed: Boolean(selection) }} />
    </fieldset>
  );
}

function PinStatus({
  isInvalid,
  gps,
  fix,
  confirmed,
}: {
  isInvalid: boolean;
  gps: "idle" | "locating" | "unavailable";
  fix: GpsFix | undefined;
  confirmed: boolean;
}) {
  const t = useTranslations("merchant");
  if (isInvalid)
    return (
      <p id="merchant-pin-error" className="merchant-error">
        {t("pinRequired")}
      </p>
    );
  if (gps === "unavailable")
    return (
      <p role="status" className="merchant-hint">
        {t("locationUnavailable")}
      </p>
    );
  if (fix && fix.accuracy > 40)
    return (
      <p role="status" className="merchant-hint">
        {t("locationImprecise")}
      </p>
    );
  if (confirmed || fix)
    return (
      <p role="status" className="merchant-hint">
        {t("pinSelected")}
      </p>
    );
  return null;
}
