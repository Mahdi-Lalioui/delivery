"use client";

import { Badge, Icon, Toggle } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useCourierLocation, type LocationState } from "./use-courier-location";

const labels = {
  off: "gpsOff",
  acquiring: "gpsAcquiring",
  sending: "gpsLive",
  buffered: "gpsBuffered",
  unavailable: "gpsUnavailable",
} as const satisfies Record<LocationState, string>;

export function CourierLocation({ orderId }: { orderId: string }) {
  const t = useTranslations("courier");
  const { state, enabled, setSharing } = useCourierLocation(orderId);
  return (
    <section className="courier-panel courier-location" aria-labelledby="courier-location-title">
      <h3 id="courier-location-title">
        <Icon name="flag" />
        {t("location")}
      </h3>
      <Toggle
        label={t("gpsShare")}
        checked={enabled}
        onChange={setSharing}
        {...(state === "off" ? { description: t(labels.off) } : {})}
      />
      {state !== "off" && (
        <div role="status">
          <Badge
            tone={state === "sending" ? "success" : state === "unavailable" ? "warning" : "neutral"}
          >
            {t(labels[state])}
          </Badge>
        </div>
      )}
      {enabled && <p>{t("gpsKeepOpen")}</p>}
    </section>
  );
}
