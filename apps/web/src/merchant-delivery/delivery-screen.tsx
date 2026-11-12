"use client";

import type { Locale } from "@zaafran/i18n/locales";
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  ToastProvider,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useMerchantResource } from "../merchant/use-merchant-resource";
import { DeliveryForm } from "./delivery-form";
import { readDeliverySettings } from "./delivery-http";

function Settings({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  const t = useTranslations("merchantDelivery");
  const read = useCallback(
    (signal: AbortSignal) => readDeliverySettings(merchantId, signal),
    [merchantId],
  );
  const { view, retry } = useMerchantResource(read);
  switch (view.kind) {
    case "loading":
      return <Skeleton label={t("loading")} lines={6} />;
    case "unauthenticated":
      return (
        <EmptyState
          icon="user"
          title={t("signInRequired")}
          action={
            <ButtonLink href={`/${locale}/sign-in?continue=merchant-status`}>
              {t("signIn")}
            </ButtonLink>
          }
        />
      );
    case "forbidden":
      return (
        <EmptyState
          icon="settings"
          title={t("forbidden")}
          action={
            <ButtonLink variant="secondary" href={`/${locale}/merchant`}>
              {t("back")}
            </ButtonLink>
          }
        />
      );
    case "error":
      return <ErrorState title={t("loadError")} retryLabel={t("reload")} onRetry={retry} />;
    case "ready":
      return <DeliveryForm merchantId={merchantId} initial={view.data} onReload={retry} />;
  }
}

export function DeliveryScreen({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  const t = useTranslations("merchantDelivery");
  return (
    <div className="delivery-settings">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        titleId="delivery-title"
        action={
          <ButtonLink href={`/${locale}/merchant`} variant="ghost">
            {t("back")}
          </ButtonLink>
        }
      />
      <ToastProvider closeLabel={t("dismiss")}>
        <Settings merchantId={merchantId} locale={locale} />
      </ToastProvider>
    </div>
  );
}
