"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { ButtonLink, Icon } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { Contacts } from "./tracking-contacts";
import type { Tracking } from "./tracking-http";

const endedStatuses: ReadonlySet<string> = new Set([
  "rejected",
  "expired",
  "cancelled",
  "delivery_failed",
]);

/** Refused, unanswered, cancelled or failed: the order will not arrive. */
export function isEnded(status: string): boolean {
  return endedStatuses.has(status);
}

/** Where to go when an order will not arrive: another restaurant, or the order list. */
function WaysOn({ locale }: { locale: Locale }) {
  const translate = useTranslations("tracking");
  return (
    <div className="tracking-ended-actions">
      <ButtonLink variant="primary" href={`/${locale}/discover`}>
        {translate("endedFind")}
      </ButtonLink>
      <ButtonLink variant="secondary" href={`/${locale}/orders`}>
        {translate("endedOrders")}
      </ButtonLink>
    </div>
  );
}

/**
 * An order that will not arrive: no live map and no future steps, just what happened, that
 * nothing is owed (cash on delivery), and where to go next.
 */
export function Ended({ tracking, locale }: { tracking: Tracking; locale: Locale }) {
  const translate = useTranslations("tracking");
  const { order } = tracking;
  return (
    <section className="tracking-ended" aria-labelledby="tracking-status">
      <span className="tracking-ended-icon" aria-hidden="true">
        <Icon name="receipt" size={32} />
      </span>
      <p className="tracking-code-line">
        {translate("code", { code: order.shortCode })}
        <bdi>{formatDzd(order.totalDzd, locale)}</bdi>
      </p>
      <h1 id="tracking-status" aria-live="polite">
        {translate(`status_${order.status}`)}
      </h1>
      {order.status === "delivery_failed" && <Contacts tracking={tracking} />}
      <WaysOn locale={locale} />
    </section>
  );
}
