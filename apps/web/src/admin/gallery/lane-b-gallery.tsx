"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { SegmentedControl } from "@zaafran/ui";
import { useState } from "react";
import { AdminBillingView } from "../billing/admin-billing";
import { MerchantBillingView } from "../billing/merchant-billing";
import {
  galleryInvoices,
  galleryMerchantId,
  gallerySubscription,
  galleryTransfer,
} from "./billing-fixtures";

// Design-build page: every lane B screen in each state, for the 390/1280 screenshot review.

type Screen = "admin-billing" | "merchant-billing";
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
      {screen === "admin-billing" ? (
        <AdminBillingSample mode={mode} locale={locale} />
      ) : (
        <MerchantBillingSample mode={mode} locale={locale} />
      )}
    </div>
  );
}
