"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { SegmentedControl } from "@zaafran/ui";
import { useState } from "react";
import { AdminBillingView } from "../billing/admin-billing";
import { BillingSettingsView } from "../billing/billing-settings";
import { settingsToDraft } from "../billing/billing-settings-http";
import { MerchantBillingView } from "../billing/merchant-billing";
import { emptyPromotionDraft } from "../../retention/promotion-draft";
import { MerchantReviewsView } from "../../retention/merchant-reviews";
import { OrderRatingView } from "../../retention/order-rating";
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
  "admin-billing" | "merchant-billing" | "billing-settings" | "promotions" | "reviews" | "rating";
type Mode = "ready" | "empty" | "loading" | "error";
const noop = () => undefined;
const noopAsync = () => Promise.resolve();

function AdminBillingSample({ mode, locale }: { mode: Mode; locale: Locale }) {
  const view =
    mode === "ready"
      ? {
          kind: "ready" as const,
          subscriptions: gallerySubscription === null ? [] : [gallerySubscription],
          invoices: galleryInvoices,
          transferProofs: [galleryTransfer],
        }
      : mode === "empty"
        ? { kind: "ready" as const, subscriptions: [], invoices: [], transferProofs: [] }
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
      ? { kind: "ready" as const, promotions: mode === "ready" ? galleryPromotions : [] }
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

export function LaneBGallery({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { screen: string; state: string };
}) {
  const [screen, setScreen] = useState<Screen>("merchant-billing");
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
      {screen === "admin-billing" && <AdminBillingSample mode={mode} locale={locale} />}
      {screen === "merchant-billing" && <MerchantBillingSample mode={mode} locale={locale} />}
      {screen === "billing-settings" && <SettingsSample mode={mode} />}
      {screen === "promotions" && <PromotionsSample mode={mode} locale={locale} />}
      {screen === "reviews" && <ReviewsSample mode={mode} />}
      {screen === "rating" && <RatingSample mode={mode} />}
    </div>
  );
}
