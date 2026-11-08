"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Badge, type BadgeTone } from "@zaafran/ui";
import { useFormatter, useTranslations } from "next-intl";

// Shared display pieces for the billing screens: status badges, money and periods.

type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
type InvoiceStatus = "issued" | "paid" | "void";

const subscriptionBadges = {
  trialing: { tone: "info", key: "statusTrialing" },
  active: { tone: "success", key: "statusActive" },
  past_due: { tone: "warning", key: "statusPastDue" },
  suspended: { tone: "danger", key: "statusSuspended" },
  cancelled: { tone: "neutral", key: "statusCancelled" },
} as const satisfies Readonly<Record<SubscriptionStatus, { tone: BadgeTone; key: string }>>;

const invoiceBadges = {
  issued: { tone: "warning", key: "invoiceIssued" },
  paid: { tone: "success", key: "invoicePaid" },
  void: { tone: "neutral", key: "invoiceVoid" },
} as const satisfies Readonly<Record<InvoiceStatus, { tone: BadgeTone; key: string }>>;

export function SubscriptionBadge({
  status,
  namespace,
}: {
  status: SubscriptionStatus;
  namespace: "adminBilling" | "merchantBilling";
}) {
  const translate = useTranslations(namespace);
  const badge = subscriptionBadges[status];
  return <Badge tone={badge.tone}>{translate(badge.key)}</Badge>;
}

export function InvoiceBadge({
  status,
  namespace,
}: {
  status: InvoiceStatus;
  namespace: "adminBilling" | "merchantBilling";
}) {
  const translate = useTranslations(namespace);
  const badge = invoiceBadges[status];
  return <Badge tone={badge.tone}>{translate(badge.key)}</Badge>;
}

/** Whole dinars as DESIGN prints them ("1 450 DA" / "1 450 دج"), isolated for RTL. */
export function Money({ amountDzd, locale }: { amountDzd: number; locale: Locale }) {
  return <bdi className="billing-money">{formatDzd(amountDzd, locale)}</bdi>;
}

/**
 * Formats each date on its own: `formatRange` separators differ between Node and browser ICU,
 * which breaks hydration.
 */
export function Period(props: {
  startsAt: string;
  endsAt: string;
  namespace: "adminBilling" | "merchantBilling";
}) {
  const translate = useTranslations(props.namespace);
  const format = useFormatter();
  const day = (value: string) =>
    format.dateTime(new Date(value), {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Algiers",
    });
  return <>{translate("periodRange", { start: day(props.startsAt), end: day(props.endsAt) })}</>;
}
