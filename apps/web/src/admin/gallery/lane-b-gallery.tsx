"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { SegmentedControl } from "@zaafran/ui";
import { useState, type ReactNode } from "react";
import { AdminBillingView } from "../billing/admin-billing";
import { BillingSettingsView } from "../billing/billing-settings";
import { settingsToDraft } from "../billing/billing-settings-http";
import { MerchantBillingView } from "../billing/merchant-billing";
import { PlatformConsoleView } from "../platform/platform-console";
import { emptyPromotionDraft } from "../../retention/promotion-draft";
import { MerchantReviewsView } from "../../retention/merchant-reviews";
import { MyOrdersView } from "../../retention/my-orders";
import { MerchantAnalyticsView } from "../../retention/analytics/analytics-views";
import { OrderRatingView } from "../../retention/order-rating";
import { CheckoutSample } from "./checkout-sample";
import { TrackingSample } from "./tracking-sample";
import { PromotionsView } from "../../retention/promotions-editor";
import { billingSettingsDefaults } from "@zaafran/contracts/billing";
import {
  galleryInvoices,
  galleryPromotions,
  galleryReviews,
  galleryMerchantId,
  gallerySubscription,
  galleryTransfer,
} from "./billing-fixtures";

// Design-build page: every lane B screen in each state, for the 390/1280 screenshot review.

type Screen =
  | "admin-billing"
  | "merchant-billing"
  | "billing-settings"
  | "promotions"
  | "reviews"
  | "rating"
  | "checkout"
  | "tracking"
  | "platform"
  | "orders"
  | "analytics";
type Mode = "ready" | "empty" | "loading" | "error";
const noop = () => undefined;
const noopAsync = () => Promise.resolve();

function AdminBillingSample({ mode, locale }: { mode: Mode; locale: Locale }) {
  const view =
    mode === "ready"
      ? {
          kind: "ready" as const,
          sessionId: galleryMerchantId,
          subscriptions: gallerySubscription === null ? [] : [gallerySubscription],
          invoices: galleryInvoices,
          transferProofs: [galleryTransfer],
        }
      : mode === "empty"
        ? {
            kind: "ready" as const,
            sessionId: galleryMerchantId,
            subscriptions: [],
            invoices: [],
            transferProofs: [],
          }
        : { kind: mode };
  return (
    <AdminBillingView
      locale={locale}
      state={{
        view,
        notice: undefined,
        noticeId: 0,
        isSaving: false,
        refresh: noop,
        confirmTransfer: noopAsync,
        voidInvoice: noopAsync,
      }}
    />
  );
}

function MerchantBillingSample({ mode, locale }: { mode: Mode; locale: Locale }) {
  const view =
    mode === "ready" || mode === "empty"
      ? {
          kind: "ready" as const,
          subscription: gallerySubscription,
          invoices: mode === "ready" ? galleryInvoices : [],
          isOnlinePaymentEnabled: false,
        }
      : { kind: mode };
  return (
    <MerchantBillingView
      merchantId={galleryMerchantId}
      locale={locale}
      state={{
        view,
        outcome: undefined,
        outcomeId: 0,
        isSubmitting: false,
        refresh: noop,
        submit: noopAsync,
      }}
    />
  );
}

function SettingsSample({ mode }: { mode: Mode }) {
  const settings = billingSettingsDefaults;
  const view =
    mode === "ready" || mode === "empty"
      ? { kind: "ready" as const, sessionId: galleryMerchantId, settings }
      : { kind: mode };
  return (
    <BillingSettingsView
      state={{
        view,
        draft: settingsToDraft(settings),
        outcome: undefined,
        outcomeId: 0,
        isSaving: false,
        change: noop,
        save: noopAsync,
        refresh: noop,
      }}
    />
  );
}

function PromotionsSample({ mode, locale }: { mode: Mode; locale: Locale }) {
  const view =
    mode === "ready" || mode === "empty"
      ? {
          kind: "ready" as const,
          sessionId: galleryMerchantId,
          promotions: mode === "ready" ? galleryPromotions : [],
        }
      : { kind: mode };
  const draft =
    mode === "ready"
      ? { ...emptyPromotionDraft, percent: "10", capDzd: "300", minimumSubtotalDzd: "1500" }
      : emptyPromotionDraft;
  return (
    <PromotionsView
      locale={locale}
      state={{
        view,
        draft,
        editingId: undefined,
        outcome: undefined,
        outcomeId: 0,
        isSaving: false,
        change: noop,
        edit: noop,
        save: noopAsync,
      }}
    />
  );
}

function ReviewsSample({ mode }: { mode: Mode }) {
  const view =
    mode === "ready" || mode === "empty"
      ? {
          kind: "ready" as const,
          reviews: mode === "ready" ? galleryReviews : [],
          nextCursor: null,
        }
      : { kind: mode };
  return (
    <MerchantReviewsView
      state={{
        view,
        stars: undefined,
        notice: undefined,
        isSaving: false,
        isPaging: false,
        filter: noop,
        loadMore: noopAsync,
        reply: noopAsync,
        report: noopAsync,
      }}
    />
  );
}

function RatingSample({ mode }: { mode: Mode }) {
  const view =
    mode === "ready" || mode === "empty"
      ? { kind: "ready" as const, rating: null }
      : { kind: mode };
  return (
    <OrderRatingView
      isDelivery
      state={{ view, outcome: undefined, isSaving: false, save: noopAsync }}
    />
  );
}

function PlatformSample({ mode }: { mode: Mode }) {
  const settings = {
    order_accept_timeout_seconds: 180,
    first_order_cash_cap_dzd: 5000,
    subscription_price_dzd: 5000,
    subscription_trial_days: 30,
    maintenance_banner: null,
  };
  const event = {
    id: galleryMerchantId,
    actorId: galleryMerchantId,
    entity: "flag" as const,
    entityId: "ramadan_mode",
    action: "flag.enabled",
    reason: "Début du Ramadan",
    createdAt: "2027-02-08T09:00:00.000Z",
  };
  const view =
    mode === "ready" || mode === "empty"
      ? {
          kind: "ready" as const,
          sessionId: galleryMerchantId,
          settings,
          flags: { ramadan_mode: true, online_payments: false, menu_photo_import: false },
        }
      : { kind: mode };
  const audit = {
    kind: "ready" as const,
    events: mode === "ready" ? [event] : [],
    nextCursor: null,
  };
  return (
    <PlatformConsoleView
      state={{
        view,
        audit,
        entity: undefined,
        notice: undefined,
        isSaving: false,
        filterAudit: noop,
        setFlag: () => Promise.resolve(true),
        setSetting: () => Promise.resolve(true),
        refresh: noop,
      }}
    />
  );
}

const galleryOrders = [
  {
    orderId: "019d6abc-0000-7000-8000-000000000601",
    merchantId: galleryMerchantId,
    restaurantName: "Dar El Couscous",
    shortCode: "K7Q2",
    status: "delivered" as const,
    fulfilment: "delivery" as const,
    totalDzd: 2350,
    placedAt: "2027-02-10T18:40:00.000Z",
  },
  {
    orderId: "019d6abc-0000-7000-8000-000000000602",
    merchantId: galleryMerchantId,
    restaurantName: "Pizzeria Bab El Oued",
    shortCode: "M3X9",
    status: "out_for_delivery" as const,
    fulfilment: "delivery" as const,
    totalDzd: 1200,
    placedAt: "2027-02-11T12:10:00.000Z",
  },
];

function OrdersSample({ mode, locale }: { mode: Mode; locale: Locale }) {
  const history =
    mode === "ready" || mode === "empty"
      ? { kind: "ready" as const, orders: mode === "ready" ? galleryOrders : [], nextCursor: null }
      : { kind: mode };
  const favourites = {
    kind: "ready" as const,
    restaurants:
      mode === "ready"
        ? [
            {
              merchantId: galleryMerchantId,
              name: "Dar El Couscous",
              slug: "dar",
              coverMediaId: null,
              isOpen: true,
            },
          ]
        : [],
  };
  return (
    <MyOrdersView
      locale={locale}
      state={{
        history,
        favourites,
        receipt: undefined,
        reorderResult: undefined,
        isPaging: false,
        showReceipt: noop,
        orderAgain: noopAsync,
        toggleFavourite: () => Promise.resolve(true),
        loadMore: noopAsync,
        refresh: noop,
      }}
    />
  );
}

const galleryAnalytics = {
  totals: {
    orders: 412,
    salesDzd: 968_400,
    averageTicketDzd: 2350,
    acceptanceRate: 9650,
    avgPrepSeconds: 1140,
    avgDeliverySeconds: 1560,
  },
  cancellations: [
    { reason: "customer_changed_mind", orders: 6 },
    { reason: "restaurant_busy", orders: 3 },
  ],
  topItems: [
    {
      itemId: "019d6abc-0000-7000-8000-000000000701",
      names: { fr: "Couscous royal", ar: "كسكس ملكي" },
      quantity: 120,
      salesDzd: 180_000,
    },
    {
      itemId: "019d6abc-0000-7000-8000-000000000702",
      names: { fr: "Chorba", ar: "شوربة" },
      quantity: 95,
      salesDzd: 42_750,
    },
  ],
  heatmap: Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) =>
      hour >= 19 && hour <= 21
        ? 8 + day * 2
        : hour >= 12 && hour <= 14
          ? 4 + day
          : hour >= 11 && hour <= 23
            ? 1
            : 0,
    ),
  ),
  repeatCustomerRate: 4100,
};

function AnalyticsSample({ mode, locale }: { mode: Mode; locale: Locale }) {
  const view =
    mode === "ready" || mode === "empty"
      ? { kind: "ready" as const, analytics: galleryAnalytics }
      : { kind: mode };
  return (
    <MerchantAnalyticsView
      locale={locale}
      state={{ view, range: "30", setRange: noop, retry: noop }}
    />
  );
}

type SampleProps = { mode: Mode; locale: Locale };
const samples: Readonly<Record<Screen, (props: SampleProps) => ReactNode>> = {
  "admin-billing": (props) => <AdminBillingSample {...props} />,
  "merchant-billing": (props) => <MerchantBillingSample {...props} />,
  "billing-settings": ({ mode }) => <SettingsSample mode={mode} />,
  promotions: (props) => <PromotionsSample {...props} />,
  reviews: ({ mode }) => <ReviewsSample mode={mode} />,
  rating: ({ mode }) => <RatingSample mode={mode} />,
  checkout: (props) => <CheckoutSample {...props} />,
  tracking: (props) => <TrackingSample {...props} />,
  platform: ({ mode }) => <PlatformSample mode={mode} />,
  orders: (props) => <OrdersSample {...props} />,
  analytics: (props) => <AnalyticsSample {...props} />,
};

function isScreen(value: string | string[] | undefined): value is Screen {
  return typeof value === "string" && Object.hasOwn(samples, value);
}

export function LaneBGallery({
  locale,
  initialScreen,
  labels,
}: {
  locale: Locale;
  initialScreen?: string | string[] | undefined;
  labels: { screen: string; state: string };
}) {
  const [screen, setScreen] = useState<Screen>(
    isScreen(initialScreen) ? initialScreen : "merchant-billing",
  );
  const [mode, setMode] = useState<Mode>("ready");
  return (
    <div className="billing-layout">
      <div className="billing-kpis">
        <SegmentedControl
          legend={labels.screen}
          name="screen"
          value={screen}
          onChange={setScreen}
          options={[
            { value: "merchant-billing", label: "MER-22" },
            { value: "admin-billing", label: "ADM-07" },
            { value: "billing-settings", label: "BIL-01" },
            { value: "promotions", label: "MER-19" },
            { value: "reviews", label: "MER-20" },
            { value: "rating", label: "CUS-22" },
            { value: "checkout", label: "CUS-13/15" },
            { value: "tracking", label: "CUS-18" },
            { value: "platform", label: "ADM-08" },
            { value: "orders", label: "CUS-21" },
            { value: "analytics", label: "MER-21" },
          ]}
        />
        <SegmentedControl
          legend={labels.state}
          name="mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "ready", label: "ready" },
            { value: "empty", label: "empty" },
            { value: "loading", label: "loading" },
            { value: "error", label: "error" },
          ]}
        />
      </div>
      {samples[screen]({ mode, locale })}
    </div>
  );
}
