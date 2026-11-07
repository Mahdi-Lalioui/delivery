"use client";

import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { GroupSnapshot } from "../option-group-http";
import { useOptionGroupEditor } from "../use-option-group-editor";
import { OptionGroupForm } from "./option-group-form";

type Controls = ReturnType<typeof useOptionGroupEditor>;

const unavailable = {
  error: "loadError",
  forbidden: "forbidden",
  "session-changed": "sessionChanged",
  "revision-conflict": "revisionConflict",
} as const;

function GroupList({
  groups,
  locale,
  controls,
}: {
  groups: GroupSnapshot["optionGroups"];
  locale: Locale;
  controls: Controls;
}) {
  const translate = useTranslations("menuOptionGroup");
  const disabled = controls.pending !== null || controls.editor !== null;
  return (
    <section className="option-group-card" aria-labelledby="option-group-list-title">
      <div className="option-group-summary">
        <h2 id="option-group-list-title" tabIndex={-1}>
          {translate("listTitle")}
        </h2>
        <button
          className="option-group-primary"
          type="button"
          id="option-group-new"
          disabled={disabled}
          onClick={controls.create}
        >
          {translate("newGroup")}
        </button>
      </div>
      {groups.length === 0 ? (
        <p className="option-group-hint">{translate("empty")}</p>
      ) : (
        <ul className="option-group-fields" role="list" aria-labelledby="option-group-list-title">
          {groups.map(({ optionGroupId, names, minimum, maximum }) => {
            const name = getLocalizedContent(names, locale) ?? "";
            return (
              <li
                className="option-group-choice"
                id={`option-group-row-${optionGroupId}`}
                key={optionGroupId}
                tabIndex={-1}
              >
                <div className="option-group-summary">
                  <h3>
                    <bdi>{name}</bdi>
                  </h3>
                  <p className="option-group-hint">
                    {translate("selectionRange", {
                      minimum: String(minimum),
                      maximum: String(maximum),
                    })}
                  </p>
                </div>
                <button
                  className="option-group-secondary"
                  type="button"
                  id={`option-group-edit-${optionGroupId}`}
                  aria-label={translate("editLabel", { name })}
                  disabled={disabled}
                  onClick={() => {
                    void controls.edit(optionGroupId);
                  }}
                >
                  {translate("edit")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LibraryContent({ locale, controls }: { locale: Locale; controls: Controls }) {
  const translate = useTranslations("menuOptionGroup");
  const { view, editor, pending, error } = controls;
  if (view.kind === "loading") return <p role="status">{translate("loading")}</p>;
  if (view.kind === "sign-in") {
    return (
      <div className="option-group-card">
        <p>{translate("signInRequired")}</p>
        <a className="option-group-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
          {translate("signIn")}
        </a>
      </div>
    );
  }
  if (view.kind !== "ready") {
    return (
      <div className="option-group-card">
        <p className="option-group-error" role="alert">
          {translate(unavailable[view.kind])}
        </p>
        {view.kind !== "forbidden" && (
          <button className="option-group-secondary" type="button" onClick={controls.retry}>
            {translate("reload")}
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      {pending === "detail" && <p role="status">{translate("loadingDetail")}</p>}
      {error && (
        <p className="option-group-error" role="alert">
          {translate(error)}
        </p>
      )}
      <div
        className="option-group-workspace"
        data-editing={editor !== null}
        aria-busy={pending !== null}
      >
        <GroupList groups={view.data.optionGroups} locale={locale} controls={controls} />
        {editor && <OptionGroupForm editor={editor} controls={controls} />}
      </div>
    </>
  );
}

function LibraryNotice({ notice }: { notice: Controls["notice"] }) {
  const translate = useTranslations("menuOptionGroup");
  const message =
    notice &&
    ("position" in notice
      ? translate(notice.kind, { position: String(notice.position) })
      : translate(notice.kind));
  return (
    <p className="option-group-notice" role="status">
      {message}
    </p>
  );
}

export function OptionGroupScreen({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  const translate = useTranslations("menuOptionGroup");
  const controls = useOptionGroupEditor(merchantId);
  const panel = useRef<HTMLElement>(null);
  const { focusId: focus, view } = controls;

  useEffect(() => {
    if (focus) panel.current?.querySelector<HTMLElement>(`#${focus.id}`)?.focus();
  }, [focus]);

  return (
    <section className="option-group-panel" aria-labelledby="option-group-title" ref={panel}>
      <header className="option-group-heading">
        <a className="option-group-secondary" href={`/${locale}/merchant/${merchantId}/menu`}>
          {translate("backToMenu")}
        </a>
        <h1 id="option-group-title" tabIndex={-1}>
          {translate("title")}
        </h1>
        {view.kind === "ready" && view.data.context && (
          <p className="option-group-context">
            <bdi>{view.data.context.restaurantName}</bdi>
          </p>
        )}
        <p>{translate("description")}</p>
      </header>
      <LibraryNotice notice={controls.notice} />
      <LibraryContent locale={locale} controls={controls} />
    </section>
  );
}
