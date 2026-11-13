"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { isDayError } from "../hours-editor";
import type { HoursState } from "../hours-flow";
import { useHoursEditor, type MerchantHoursEditor } from "../use-hours-editor";
import { HoursPauseControl } from "./hours-pause-control";
import { HoursPreviewList } from "./hours-preview-list";
import { RamadanCard } from "./ramadan-card";
import { ReloadHours, reloadMessages, SaveOutcome } from "./save-outcome";
import { WeeklyHoursFields } from "./weekly-hours-fields";

type Editable = Extract<HoursState, { kind: "editing" | "saving" }>;
type LoadFailure = Extract<HoursState, { kind: "load-failed" }>["failure"];

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

const previewSchedules = [
  { schedule: "regular", label: "previewRegular" },
  { schedule: "ramadan", label: "previewRamadan" },
] as const;

function PreviewChoice({ controls }: { controls: MerchantHoursEditor }) {
  const translate = useTranslations("merchantHours");
  return (
    <div className="hours-pause-actions" role="group" aria-label={translate("previewChoice")}>
      {previewSchedules.map(({ schedule, label }) => (
        <button
          key={schedule}
          className="menu-item-secondary"
          type="button"
          aria-pressed={controls.previewSchedule === schedule}
          data-preview={schedule}
          onClick={() => {
            controls.showPreview(schedule);
          }}
        >
          {translate(label)}
        </button>
      ))}
    </div>
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
  const { pause, ramadan } = controls;
  const isRamadanSaving = ramadan.state.kind === "saving";
  const isSaving = state.kind === "saving" || pause.state.kind === "saving" || isRamadanSaving;
  return (
    <div className="hours-workspace">
      <div className="hours-card">
        <HoursPauseControl
          state={pause.state}
          isPaused={pause.isPaused}
          isDisabled={state.kind === "saving" || isRamadanSaving}
          locale={locale}
          onClose={pause.close}
          onReopen={pause.reopen}
          onRetry={pause.retry}
          onReload={controls.reload}
        />
      </div>
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
          errors={state.errors.filter(isDayError)}
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
      <RamadanCard
        controls={controls}
        isDisabled={state.kind === "saving" || pause.state.kind === "saving"}
      />
      <div className="hours-card">
        <PreviewChoice controls={controls} />
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
