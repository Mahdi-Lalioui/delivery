"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { MediaPhotoField } from "../../media-photo/media-photo-field";
import {
  ApplicationPinFields,
  ApplicationTextField,
  CommuneField,
  CuisineFields,
} from "./application-fields";
import { listWilayaCommunes } from "../merchant-http";
import { useMerchantApplication, type MerchantApplicationState } from "../use-merchant-application";
import { useMerchantResource } from "../use-merchant-resource";
import { WilayaField } from "./wilaya-field";

function ApplicationFeedback({
  error,
  hasInvalidFields,
}: {
  error: MerchantApplicationState["error"];
  hasInvalidFields: boolean;
}) {
  const translate = useTranslations("merchant");
  return (
    <>
      {hasInvalidFields && (
        <p role="alert" className="merchant-error">
          {translate("fixErrors")}
        </p>
      )}
      {error && error !== "invalidCommune" && (
        <p className="merchant-error" role="alert" id="merchant-application-error">
          {translate(error)}
        </p>
      )}
    </>
  );
}

const applicationPhotoSlots = [0, 1, 2, 3, 4];

function ApplicationPhotos({
  state,
  sessionId,
  onBusyChange,
  busyPhotos,
}: {
  state: MerchantApplicationState;
  sessionId: string;
  onBusyChange: (slot: number, busy: boolean) => void;
  busyPhotos: ReadonlySet<number>;
}) {
  const photoIds = state.draft.photoIds ?? [];
  return applicationPhotoSlots.slice(0, photoIds.length + 1).map((slot) => (
    <MediaPhotoField
      key={slot}
      kind="application"
      expectedSessionId={sessionId}
      mediaId={photoIds[slot]}
      onChange={(mediaId) => {
        state.updatePhoto(slot, mediaId);
      }}
      onBusyChange={(busy) => {
        onBusyChange(slot, busy);
      }}
      disabled={state.pending || (busyPhotos.size > 0 && !busyPhotos.has(slot))}
    />
  ));
}

export function MerchantApplicationForm({
  locale,
  sessionId,
  onRefreshAccount,
}: {
  locale: Locale;
  sessionId: string;
  onRefreshAccount: () => void;
}) {
  const translate = useTranslations("merchant");
  const state = useMerchantApplication(sessionId);
  const [wilaya, setWilaya] = useState(16);
  const readCommunes = useCallback(
    (signal: AbortSignal) => listWilayaCommunes(wilaya, signal),
    [wilaya],
  );
  const communeResource = useMerchantResource(readCommunes);
  const [locating, setLocating] = useState(false);
  const [busyPhotos, setBusyPhotos] = useState<ReadonlySet<number>>(() => new Set());
  const form = useRef<HTMLFormElement>(null);
  const success = useRef<HTMLHeadingElement>(null);
  const refresh = useRef<HTMLButtonElement>(null);
  const canSubmit =
    communeResource.view.kind === "ready" &&
    communeResource.view.data.length > 0 &&
    !locating &&
    busyPhotos.size === 0;

  function updatePhotoBusy(slot: number, busy: boolean) {
    setBusyPhotos((current) => {
      if (current.has(slot) === busy) return current;
      const next = new Set(current);
      if (busy) next.add(slot);
      else next.delete(slot);
      return next;
    });
  }

  useEffect(() => {
    if (state.submitted) success.current?.focus();
    if (state.sessionChanged) refresh.current?.focus();
  }, [state.submitted, state.sessionChanged]);

  if (state.sessionChanged) {
    return (
      <div className="merchant-card">
        <p className="merchant-error" role="alert">
          {translate("sessionChanged")}
        </p>
        <button
          type="button"
          className="merchant-secondary"
          ref={refresh}
          onClick={onRefreshAccount}
        >
          {translate("refreshAccount")}
        </button>
      </div>
    );
  }

  if (state.submitted) {
    return (
      <div className="merchant-card">
        <h2 tabIndex={-1} ref={success}>
          {translate("submittedTitle")}
        </h2>
        <p role="status">{translate("submittedDescription")}</p>
      </div>
    );
  }

  return (
    <form
      className="merchant-card merchant-form"
      ref={form}
      method="post"
      noValidate
      aria-busy={state.pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        void state.submit().then((field) => {
          if (field) form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
        });
      }}
    >
      <p className="merchant-hint">{translate("verifiedPhone")}</p>
      <fieldset className="merchant-form-fields" disabled={state.pending}>
        <div className="merchant-grid">
          <ApplicationTextField state={state} field="restaurantName" />
          <ApplicationTextField state={state} field="ownerName" />
        </div>
        <div className="merchant-grid">
          <WilayaField
            locale={locale}
            value={wilaya}
            label={translate("wilaya")}
            loadingText={translate("wilayasLoading")}
            errorText={translate("wilayasError")}
            retryText={translate("retry")}
            onChange={(code) => {
              setWilaya(code);
              state.update({ communeId: "" });
            }}
          />
          <CommuneField state={state} locale={locale} resource={communeResource} />
        </div>
        <ApplicationPinFields state={state} onLocatingChange={setLocating} />
        <CuisineFields state={state} />
        <ApplicationTextField state={state} field="rcNumber" />
        <ApplicationPhotos
          state={state}
          sessionId={sessionId}
          onBusyChange={updatePhotoBusy}
          busyPhotos={busyPhotos}
        />
      </fieldset>
      <ApplicationFeedback error={state.error} hasInvalidFields={state.fields.length > 0} />
      {state.error === "signInRequired" ? (
        <a className="merchant-primary" href={`/${locale}/sign-in?continue=merchant-apply`}>
          {translate("signIn")}
        </a>
      ) : (
        <button type="submit" className="merchant-primary" disabled={state.pending || !canSubmit}>
          {translate(state.pending ? "submitting" : "submit")}
        </button>
      )}
    </form>
  );
}
