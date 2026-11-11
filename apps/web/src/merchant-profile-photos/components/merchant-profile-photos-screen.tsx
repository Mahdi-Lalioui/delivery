"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { useMerchantResource } from "../../merchant/use-merchant-resource";
import {
  readProfilePhotos,
  type ProfilePhotos,
  type ProfilePhotosAccess,
} from "../merchant-profile-photos-http";
import { MerchantProfilePhotosForm } from "./merchant-profile-photos-form";

type View =
  ReturnType<typeof useMerchantResource<ProfilePhotos>>["view"] | { kind: "session-changed" };

const loadMessages = {
  forbidden: "forbidden",
  error: "loadError",
  "session-changed": "sessionChanged",
} as const;

function ProfilePhotosFallback({
  kind,
  locale,
  reload,
}: {
  kind: Exclude<View["kind"], "ready">;
  locale: Locale;
  reload: () => void;
}) {
  const t = useTranslations("merchantProfilePhotos");
  if (kind === "loading") {
    return (
      <div className="profile-photos-grid" role="status" aria-label={t("loading")}>
        <div className="profile-photos-skeleton" data-kind="cover" aria-hidden="true" />
        <div className="profile-photos-skeleton" data-kind="logo" aria-hidden="true" />
      </div>
    );
  }
  if (kind === "unauthenticated") {
    return (
      <div className="profile-photos-fallback">
        <p>{t("signInRequired")}</p>
        <a
          href={`/${locale}/sign-in?continue=merchant-status`}
          className="profile-photos-secondary"
        >
          {t("signIn")}
        </a>
      </div>
    );
  }
  return (
    <div className="profile-photos-fallback">
      <p className="profile-photos-error" role="alert">
        {t(loadMessages[kind])}
      </p>
      {kind !== "forbidden" && (
        <button type="button" className="profile-photos-secondary" onClick={reload}>
          {t("reload")}
        </button>
      )}
    </div>
  );
}

export function MerchantProfilePhotosScreen({
  locale,
  merchantId,
}: {
  locale: Locale;
  merchantId: string;
}) {
  const t = useTranslations("merchantProfilePhotos");
  const read = useCallback(
    (signal: AbortSignal) => readProfilePhotos({ merchantId, signal }),
    [merchantId],
  );
  const resource = useMerchantResource(read);
  const [access, setAccess] = useState<ProfilePhotosAccess>();
  const view = access ? { kind: access } : resource.view;
  const heading = useRef<HTMLHeadingElement>(null);

  function reload() {
    setAccess(undefined);
    resource.retry();
    heading.current?.focus();
  }

  function changeAccess(kind: ProfilePhotosAccess) {
    setAccess(kind);
    heading.current?.focus();
  }

  return (
    <section className="profile-photos-panel" aria-labelledby="profile-photos-title">
      <header>
        <a className="profile-photos-back" href={`/${locale}/merchant/${merchantId}/setup`}>
          {t("back")}
        </a>
        <h1 id="profile-photos-title" ref={heading} tabIndex={-1}>
          {t("title")}
        </h1>
        <p>{t("description")}</p>
      </header>
      {view.kind === "ready" ? (
        <MerchantProfilePhotosForm
          key={view.data.sessionId}
          merchantId={merchantId}
          initial={view.data}
          onAccessChanged={changeAccess}
          onReload={reload}
        />
      ) : (
        <ProfilePhotosFallback kind={view.kind} locale={locale} reload={reload} />
      )}
    </section>
  );
}
