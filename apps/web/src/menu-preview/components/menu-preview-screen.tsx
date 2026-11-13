"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useCallback, useRef } from "react";
import { useMerchantResource } from "../../merchant/use-merchant-resource";
import { loadMenuPreview, type MenuPreview } from "../menu-preview-http";
import { MenuPreviewList } from "./menu-preview-list";

type PreviewView = ReturnType<typeof useMerchantResource<MenuPreview>>["view"];

function PreviewContent({
  view,
  locale,
  retry,
}: {
  view: PreviewView;
  locale: Locale;
  retry: () => void;
}) {
  const translate = useTranslations("menuPreview");

  switch (view.kind) {
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "unauthenticated":
      return (
        <div className="menu-preview-card">
          <p>{translate("signInRequired")}</p>
          <a className="menu-preview-link" href={`/${locale}/sign-in?continue=merchant-status`}>
            {translate("signIn")}
          </a>
        </div>
      );
    case "forbidden":
      return (
        <p className="menu-preview-error" role="alert">
          {translate("forbidden")}
        </p>
      );
    case "error":
      return (
        <div className="menu-preview-card">
          <p className="menu-preview-error" role="alert">
            {translate("loadError")}
          </p>
          <button type="button" className="menu-preview-link" onClick={retry}>
            {translate("retry")}
          </button>
        </div>
      );
    case "ready":
      return (
        <>
          <p className="menu-preview-restaurant">
            <bdi>{view.data.restaurantName}</bdi>
          </p>
          <MenuPreviewList preview={view.data} locale={locale} />
        </>
      );
  }
}

export function MenuPreviewScreen({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  const translate = useTranslations("menuPreview");
  const read = useCallback(
    (signal: AbortSignal) => loadMenuPreview({ merchantId, signal }),
    [merchantId],
  );
  const { view, retry } = useMerchantResource(read);
  const title = useRef<HTMLHeadingElement>(null);

  function retryRead() {
    retry();
    title.current?.focus();
  }

  return (
    <section className="menu-preview-panel" aria-labelledby="menu-preview-title">
      <header className="menu-preview-heading">
        <a className="menu-preview-link" href={`/${locale}/merchant/${merchantId}/menu`}>
          {translate("backToMenu")}
        </a>
        <h1 id="menu-preview-title" tabIndex={-1} ref={title}>
          {translate("title")}
        </h1>
        <p>{translate("description")}</p>
      </header>
      <PreviewContent view={view} locale={locale} retry={retryRead} />
    </section>
  );
}
