"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { HoursState } from "../hours-flow";
import { useHoursEditor, type MerchantHoursEditor } from "../use-hours-editor";
import { HoursPreviewList } from "./hours-preview-list";
import { WeeklyHoursFields } from "./weekly-hours-fields";

type Editable = Extract<HoursState, { kind: "editing" | "saving" }>;
type LoadFailure = Extract<HoursState, { kind: "load-failed" }>["failure"];
type SaveFailure = NonNullable<Extract<HoursState, { kind: "editing" }>["failure"]>;

const reloadMessages = {
  "session-changed": "sessionChanged",
  "revision-conflict": "revisionConflict",
} as const;
const failureMessages = {
  "rate-limited": "rateLimited",
  "invalid-hours": "invalidHours",
  "pause-in-past": "invalidHours",
  "sign-in": "signInRequired",
  forbidden: "forbidden",
  error: "saveError",
} as const;

function ReloadHours({ message, reload }: { message: string; reload: () => void }) {
  const translate = useTranslations("merchantHours");
  return (
    <div className="hours-card">
      <p className="hours-error" role="alert">
        {message}
      </p>
      <button className="menu-item-secondary" type="button" data-hours-reload onClick={reload}>
        {translate("reload")}
      </button>
    </div>
  );
}

function HoursGate({
  failure,
  locale,
  reload,
}: {
  failure: LoadFailure | "loading";
  locale: Locale;
  reload: () => void;
}) {
  const translate = useTranslations("merchantHours");
  if (failure === "loading") return <p role="status">{translate("loading")}</p>;
  if (failure === "sign-in") {
    return (
      <div className="hours-card">
        <p>{translate("signInRequired")}</p>
        <a className="menu-item-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
          {translate("signIn")}
        </a>
      </div>
    );
  }
  if (failure === "forbidden") {
    return (
      <p className="hours-error" role="alert">
        {translate("forbidden")}
      </p>
    );
  }
  const isStale = failure === "session-changed" || failure === "revision-conflict";
  const message = isStale ? reloadMessages[failure] : "loadError";
  return <ReloadHours message={translate(message)} reload={reload} />;
}

function SaveOutcome({ state, reload }: { state: Editable; reload: () => void }) {
  const translate = useTranslations("merchantHours");
  if (state.kind === "saving") return <p role="status">{translate("saving")}</p>;
  const { failure, notice } = state;
  if (failure === "revision-conflict" || failure === "session-changed") {
    return <ReloadHours message={translate(reloadMessages[failure])} reload={reload} />;
  }
  if (failure) {
    return (
      <p className="hours-error" role="alert">
        {translate(failureMessages[failure satisfies SaveFailure])}
      </p>
    );
  }
  return (
    <p className="hours-announcement" role="status">
      {notice === "saved" ? translate("saved") : null}
    </p>
  );
}

function HoursPreviewPanel({
  preview,
  locale,
}: {
  preview: MerchantHoursEditor["preview"];
  locale: Locale;
}) {
  const translate = useTranslations("merchantHours");
  if (preview.kind === "ready") return <HoursPreviewList preview={preview.data} locale={locale} />;
  return (
    <section className="hours-preview" aria-labelledby="hours-preview-title">
      <h2 id="hours-preview-title">{translate("previewTitle")}</h2>
      {preview.kind === "loading" ? (
        <p role="status">{translate("previewLoading")}</p>
      ) : (
        <p className="hours-error">{translate("previewError")}</p>
      )}
    </section>
  );
}

function HoursWorkspace({
  state,
  controls,
  locale,
}: {
  state: Editable;
  controls: MerchantHoursEditor;
  locale: Locale;
}) {
  const translate = useTranslations("merchantHours");
  const isSaving = state.kind === "saving";
  return (
    <div className="hours-workspace">
      <form
        className="hours-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void controls.save();
        }}
      >
        <WeeklyHoursFields
          draft={state.draft}
          errors={state.errors}
          isDisabled={isSaving}
          onChange={controls.change}
          onAdd={controls.add}
          onRemove={controls.remove}
        />
        <SaveOutcome state={state} reload={controls.reload} />
        <button className="menu-item-primary" type="submit" data-hours-save disabled={isSaving}>
          {translate("save")}
        </button>
      </form>
      <div className="hours-card">
        <HoursPreviewPanel preview={controls.preview} locale={locale} />
      </div>
    </div>
  );
}

export function MerchantHoursScreen({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  const translate = useTranslations("merchantHours");
  const controls = useHoursEditor(merchantId);
  const panel = useRef<HTMLElement>(null);
  const { state, focus } = controls;

  useEffect(() => {
    if (focus) panel.current?.querySelector<HTMLElement>(focus.selector)?.focus();
  }, [focus]);

  return (
    <section className="hours-panel" aria-labelledby="hours-title" ref={panel}>
      <header className="hours-heading">
        <a className="menu-item-secondary" href={`/${locale}/merchant`}>
          {translate("backToRestaurants")}
        </a>
        <h1 id="hours-title">{translate("title")}</h1>
        <p>{translate("description")}</p>
      </header>
      {state.kind === "editing" || state.kind === "saving" ? (
        <HoursWorkspace state={state} controls={controls} locale={locale} />
      ) : (
        <HoursGate
          failure={state.kind === "loading" ? "loading" : state.failure}
          locale={locale}
          reload={controls.reload}
        />
      )}
    </section>
  );
}
