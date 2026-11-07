"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useMenuItemEditor } from "../use-menu-item-editor";
import { MenuItemForm } from "./menu-item-form";
import { MenuItemList } from "./menu-item-list";

type Controls = ReturnType<typeof useMenuItemEditor>;

const unavailableMessages = {
  error: "loadError",
  forbidden: "forbidden",
  "session-changed": "sessionChanged",
  "revision-conflict": "revisionConflict",
} as const;

const fieldIds = {
  names: "menu-item-nameAr",
  descriptions: "menu-item-descriptionAr",
  price: "menu-item-price",
  prep: "menu-item-prep",
};

function focusId(focus: NonNullable<Controls["focus"]>) {
  switch (focus.kind) {
    case "heading":
      return "menu-item-title";
    case "list":
      return "menu-item-list-title";
    case "editor":
      return "menu-item-editor-title";
    case "field":
      return fieldIds[focus.field];
    case "control":
      return focus.id;
    case "row":
      return `menu-item-row-${focus.itemId}`;
    case "confirmation":
      return `menu-item-confirm-${focus.itemId}`;
  }
}

function ItemContent({ locale, controls }: { locale: Locale; controls: Controls }) {
  const translate = useTranslations("menuItem");
  const { view, editor, pending, retry } = controls;

  if (view.kind === "loading") return <p role="status">{translate("loading")}</p>;
  if (view.kind === "sign-in") {
    return (
      <div className="menu-item-card">
        <p>{translate("signInRequired")}</p>
        <a className="menu-item-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
          {translate("signIn")}
        </a>
      </div>
    );
  }
  if (view.kind !== "ready") {
    return (
      <div className="menu-item-card">
        <p className="menu-item-error" role="alert">
          {translate(unavailableMessages[view.kind])}
        </p>
        {view.kind !== "forbidden" && (
          <button className="menu-item-secondary" type="button" onClick={retry}>
            {translate("reload")}
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {controls.error && (
        <p className="menu-item-error" role="alert">
          {translate(controls.error)}
        </p>
      )}
      <div className="menu-item-workspace" data-editing={editor !== null} aria-busy={pending}>
        <MenuItemList items={view.data.items} locale={locale} controls={controls} />
        {editor && <MenuItemForm {...controls} editor={editor} />}
      </div>
    </>
  );
}

export function MenuItemScreen({
  merchantId,
  categoryId,
  locale,
}: {
  merchantId: string;
  categoryId: string;
  locale: Locale;
}) {
  const translate = useTranslations("menuItem");
  const controls = useMenuItemEditor({ merchantId, categoryId });
  const panel = useRef<HTMLElement>(null);
  const { focus, notice } = controls;

  useEffect(() => {
    if (focus) panel.current?.querySelector<HTMLElement>(`#${focusId(focus)}`)?.focus();
  }, [focus]);

  return (
    <section className="menu-item-panel" aria-labelledby="menu-item-title" ref={panel}>
      <header className="menu-item-heading">
        <a className="menu-item-secondary" href={`/${locale}/merchant/${merchantId}/menu`}>
          {translate("backToCategories")}
        </a>
        <h1 id="menu-item-title" tabIndex={-1}>
          {translate("title")}
        </h1>
        <p>{translate("description")}</p>
      </header>
      <p className="menu-item-notice" role="status">
        {notice && translate(notice)}
      </p>
      <ItemContent locale={locale} controls={controls} />
    </section>
  );
}
