"use client";

import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { BulkPricePanel } from "../../menu-price/components/bulk-price-panel";
import { useBulkPricePanel } from "../../menu-price/use-bulk-price-panel";
import { useMenuItemEditor } from "../use-menu-item-editor";
import { MenuItemCategoryRail } from "./menu-item-category-rail";
import { MenuItemForm } from "./menu-item-form";
import { MenuItemImport } from "./menu-item-import";
import { MenuItemList } from "./menu-item-list";

type Controls = ReturnType<typeof useMenuItemEditor>;
type ItemSnapshot = Extract<Controls["view"], { kind: "ready" }>["data"];

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

interface WorkspaceProps {
  merchantId: string;
  categoryId: string;
  locale: Locale;
  controls: Controls;
}

function BulkPriceSection({
  merchantId,
  locale,
  controls,
  snapshot,
  isBlocked,
}: Omit<WorkspaceProps, "categoryId"> & { snapshot: ItemSnapshot; isBlocked: boolean }) {
  const bulkControls = useBulkPricePanel({
    merchantId,
    snapshot,
    isBlocked,
    onSaved: controls.reloadAfter,
  });
  const items = snapshot.items.map((item) => ({
    itemId: item.itemId,
    name: getLocalizedContent(item.names, locale) ?? "",
    priceDzd: item.priceDzd,
  }));
  return <BulkPricePanel items={items} locale={locale} controls={bulkControls} />;
}

function ItemWorkspace({
  merchantId,
  categoryId,
  locale,
  controls,
  snapshot,
}: WorkspaceProps & { snapshot: ItemSnapshot }) {
  const translate = useTranslations("menuItem");
  const { editor, pending, archiveTarget, inlinePrice, onRailAccessChanged } = controls;
  const blocked = pending || editor !== null || archiveTarget !== null || inlinePrice !== null;

  return (
    <>
      {controls.error && (
        <p className="menu-item-error" role="alert">
          {translate(controls.error)}
        </p>
      )}
      <div className="menu-item-workspace" data-editing={editor !== null} aria-busy={pending}>
        <MenuItemCategoryRail
          merchantId={merchantId}
          categoryId={categoryId}
          locale={locale}
          expected={snapshot}
          blocked={blocked}
          onAccessChanged={onRailAccessChanged}
        />
        <MenuItemList
          items={snapshot.items}
          locale={locale}
          controls={controls}
          blocked={blocked}
        />
        {editor && (
          <MenuItemForm
            {...controls}
            editor={editor}
            locale={locale}
            merchantId={merchantId}
            sessionId={snapshot.sessionId}
          />
        )}
      </div>
      {snapshot.items.length > 0 && (
        <BulkPriceSection
          merchantId={merchantId}
          locale={locale}
          controls={controls}
          snapshot={snapshot}
          isBlocked={blocked}
        />
      )}
      <MenuItemImport
        merchantId={merchantId}
        locale={locale}
        snapshot={snapshot}
        blocked={blocked}
        onSaved={controls.reloadAfter}
        onAccessChanged={onRailAccessChanged}
        onReload={controls.retry}
      />
    </>
  );
}

function ItemContent(props: WorkspaceProps) {
  const { locale, controls } = props;
  const translate = useTranslations("menuItem");
  const { view, retry } = controls;

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

  return <ItemWorkspace {...props} snapshot={view.data} />;
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
  const { focus, notice, view } = controls;
  const context = view.kind === "ready" ? view.data.context : undefined;

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
        {context && (
          <p className="menu-item-context">
            <bdi>{context.restaurantName}</bdi>
            <span aria-hidden="true">{translate("contextSeparator")}</span>
            <bdi>{getLocalizedContent(context.categoryNames, locale)}</bdi>
          </p>
        )}
        <p>{translate("description")}</p>
      </header>
      <p className="menu-item-notice" role="status">
        {notice && translate(notice)}
      </p>
      <ItemContent
        merchantId={merchantId}
        categoryId={categoryId}
        locale={locale}
        controls={controls}
      />
    </section>
  );
}
