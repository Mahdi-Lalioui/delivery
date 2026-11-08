"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { countdownParts } from "./scheduling";

const tickMs = 1000;

function useNow(): number | undefined {
  // Undefined during server render so the markup does not depend on the server clock.
  const [now, setNow] = useState<number>();
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, tickMs);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** HRS-03 / DESIGN §7.1-7: slim banner counting down to Maghrib on home during Ramadan. */
export function IftarCountdown({ maghribAt }: { maghribAt: string }) {
  const translate = useTranslations("retentionScheduling");
  const format = useFormatter();
  const now = useNow();
  const maghribMs = Date.parse(maghribAt);
  const parts = now === undefined ? undefined : countdownParts({ now, maghribAt: maghribMs });
  const isPast = parts !== undefined && parts.hours + parts.minutes + parts.seconds === 0;
  const time = parts === undefined ? "" : translate("countdownTime", parts);
  return (
    <aside className="iftar-banner" aria-labelledby="iftar-banner-label">
      <span className="iftar-banner-icon" aria-hidden="true" />
      <p id="iftar-banner-label">
        {isPast
          ? translate("iftarNow")
          : translate("iftarAt", {
              time: format.dateTime(new Date(maghribMs), {
                timeStyle: "short",
                timeZone: "Africa/Algiers",
              }),
            })}
      </p>
      {!isPast && parts !== undefined && (
        // A live region that announced every second would be noise; the timer role is silent.
        <p role="timer" aria-label={translate("countdown", { time })} className="iftar-banner-time">
          {time}
        </p>
      )}
    </aside>
  );
}
