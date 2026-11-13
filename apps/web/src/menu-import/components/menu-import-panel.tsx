"use client";

import { brand } from "@zaafran/config/brand";
import { menuImportColumns } from "@zaafran/contracts/menu-import";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useRef, type RefObject } from "react";
import type { MenuImportState } from "../import-flow";
import type { MenuImportControls } from "../import-controls";
import { ImportErrorTable, ImportRowTable, ImportSummary } from "./menu-import-tables";
import { ImportFeedback } from "./menu-import-feedback";
import "./menu-import.css";

const templateName = `${brand.name.toLowerCase()}-menu-template.csv`;
const templateHref =
  "data:text/csv;charset=utf-8," +
  encodeURIComponent("\uFEFF" + menuImportColumns.join(",") + "\r\n");

function isImportBusy({ state, pending }: MenuImportControls): boolean {
  return pending || state.kind === "applying" || state.kind === "previewing";
}

function getPreview(state: MenuImportState) {
  return state.kind === "previewed" || state.kind === "applying" ? state.preview : undefined;
}

function canApplyImport(controls: MenuImportControls): boolean {
  const { state } = controls;
  return (
    state.kind === "previewed" &&
    state.preview.previewToken !== null &&
    state.preview.errors.length === 0 &&
    !isImportBusy(controls)
  );
}

const reloadFailures = new Set(["session-changed", "revision-conflict", "forbidden", "sign-in"]);

function ImportFile({
  controls,
  inputRef,
}: {
  controls: MenuImportControls;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const translate = useTranslations("menuImport");
  const { fileName, fileError } = controls;
  const isBusy = isImportBusy(controls);
  return (
    <div className="menu-item-field">
      <label htmlFor="menu-import-file">{translate("fileLabel")}</label>
      <p className="menu-item-hint" id="menu-import-file-hint">
        {translate("fileHint")}
      </p>
      <input
        id="menu-import-file"
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={isBusy}
        aria-invalid={Boolean(fileError) || undefined}
        aria-describedby={
          fileError ? "menu-import-file-hint menu-import-file-error" : "menu-import-file-hint"
        }
        onChange={(event) => {
          controls.chooseFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {fileName && (
        <p className="menu-item-hint">
          {translate("fileName")} <bdi>{fileName}</bdi>
        </p>
      )}
    </div>
  );
}

function ImportActions({ controls, reset }: { controls: MenuImportControls; reset: () => void }) {
  const translate = useTranslations("menuImport");
  const { state } = controls;
  const isBusy = isImportBusy(controls);
  const failure = "failure" in state ? state.failure : undefined;
  const canReview = "draft" in state && !isBusy;
  const canApply = canApplyImport(controls);

  return (
    <div className="menu-item-actions">
      {state.kind === "applied" ? (
        <button className="menu-item-secondary" type="button" onClick={reset} disabled={isBusy}>
          {translate("newImport")}
        </button>
      ) : (
        <>
          <button
            id="menu-import-preview"
            className="menu-item-secondary"
            type="button"
            disabled={!canReview}
            onClick={controls.preview}
          >
            {translate(state.kind === "previewing" ? "previewing" : "preview")}
          </button>
          {"draft" in state && (
            <button className="menu-item-secondary" type="button" onClick={reset} disabled={isBusy}>
              {translate("chooseAnother")}
            </button>
          )}
        </>
      )}
      <button
        id="menu-import-apply"
        className="menu-item-primary"
        type="button"
        disabled={!canApply}
        onClick={controls.apply}
      >
        {translate(state.kind === "applying" ? "applying" : "apply")}
      </button>
      {failure && reloadFailures.has(failure) && (
        <button
          className="menu-item-secondary"
          type="button"
          onClick={controls.reload}
          disabled={isBusy}
        >
          {translate("reload")}
        </button>
      )}
    </div>
  );
}

function ImportReport({ state, locale }: { state: MenuImportState; locale: Locale }) {
  const translate = useTranslations("menuImport");
  const report = getPreview(state);
  const isApplied = state.kind === "applied";
  const summary = isApplied ? state.result.summary : report?.summary;
  const rows = "draft" in state ? state.draft.input.rows : undefined;

  return (
    <>
      {report && report.errors.length > 0 && (
        <ImportErrorTable errors={report.errors} locale={locale} />
      )}
      {summary && <ImportSummary summary={summary} locale={locale} applied={isApplied} />}
      {rows && (
        <>
          <p className="menu-item-hint">{translate("rowCount", { count: rows.length })}</p>
          <ImportRowTable rows={rows} locale={locale} />
        </>
      )}
    </>
  );
}

export function MenuImportPanel({
  locale,
  controls,
}: {
  locale: Locale;
  controls: MenuImportControls;
}) {
  const translate = useTranslations("menuImport");
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section
      className="menu-item-card menu-import-panel"
      aria-labelledby="menu-import-title"
      aria-busy={isImportBusy(controls)}
    >
      <h2 id="menu-import-title" tabIndex={-1}>
        {translate("title")}
      </h2>
      <p>{translate("description")}</p>
      <div className="menu-item-actions">
        <a className="menu-item-secondary" href={templateHref} download={templateName}>
          {translate("downloadTemplate")}
        </a>
      </div>
      <ImportFile controls={controls} inputRef={fileInput} />
      <ImportFeedback controls={controls} preview={getPreview(controls.state)} />
      <ImportReport state={controls.state} locale={locale} />
      <ImportActions
        controls={controls}
        reset={() => {
          controls.reset();
          fileInput.current?.focus();
        }}
      />
    </section>
  );
}
