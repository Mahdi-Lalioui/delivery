"use client";

import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { CategorySnapshot } from "../menu-category-http";
import { useMenuCategoryEditor, type MenuCategoryEditor } from "../use-menu-category-editor";
import { CategoryForm } from "./category-form";
import { CategoryList } from "./category-list";

type Gate = Exclude<MenuCategoryEditor["view"]["kind"], "ready">;

function ReloadCategories({
  message,
  reload,
}: {
  message: "sessionChanged" | "revisionConflict" | "loadError";
  reload: () => void;
}) {
  const translate = useTranslations("menuCategory");
  return (
    <div className="menu-category-card">
      <p className="menu-category-error" role="alert">
        {translate(message)}
      </p>
      <button
        className="menu-category-secondary"
        type="button"
        data-category-reload
        onClick={reload}
      >
        {translate("reload")}
      </button>
    </div>
  );
}

function CategoryGate({
  kind,
  locale,
  reload,
}: {
  kind: Gate;
  locale: Locale;
  reload: () => void;
}) {
  const translate = useTranslations("menuCategory");

  switch (kind) {
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "sign-in":
      return (
        <div className="menu-category-card">
          <p>{translate("signInRequired")}</p>
          <a className="menu-category-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
            {translate("signIn")}
          </a>
        </div>
      );
    case "forbidden":
      return (
        <p className="menu-category-error" role="alert">
          {translate("forbidden")}
        </p>
      );
    case "session-changed":
      return <ReloadCategories message="sessionChanged" reload={reload} />;
    case "revision-conflict":
      return <ReloadCategories message="revisionConflict" reload={reload} />;
    case "error":
      return <ReloadCategories message="loadError" reload={reload} />;
  }
}

function CategoryAnnouncement({
  snapshot,
  locale,
  notice,
}: {
  snapshot: CategorySnapshot;
  locale: Locale;
  notice: MenuCategoryEditor["notice"];
}) {
  const translate = useTranslations("menuCategory");
  if (!notice) return <p className="menu-category-announcement" role="status" />;
  if (notice.kind !== "moved")
    return (
      <p className="menu-category-announcement" role="status">
        {translate(notice.kind)}
      </p>
    );

  const category = snapshot.categories.find(({ categoryId }) => categoryId === notice.categoryId);
  const name = category ? (getLocalizedContent(category.names, locale) ?? "") : "";
  return (
    <p className="menu-category-announcement" role="status">
      {translate("moved", {
        name: `\u2068${name}\u2069`,
        position: String(notice.position),
        total: String(notice.total),
      })}
    </p>
  );
}

function CategoryWorkspace({
  merchantId,
  snapshot,
  controls,
  locale,
}: {
  merchantId: string;
  snapshot: CategorySnapshot;
  controls: MenuCategoryEditor;
  locale: Locale;
}) {
  const translate = useTranslations("menuCategory");

  return (
    <>
      {controls.revisionConflict && (
        <ReloadCategories message="revisionConflict" reload={controls.reload} />
      )}
      {controls.saveError && (
        <p className="menu-category-error" role="alert">
          {translate(controls.saveError)}
        </p>
      )}
      <CategoryAnnouncement snapshot={snapshot} notice={controls.notice} locale={locale} />
      <div className="menu-category-workspace">
        <CategoryList
          merchantId={merchantId}
          categories={snapshot.categories}
          controls={controls}
          locale={locale}
        />
        <CategoryForm controls={controls} />
      </div>
    </>
  );
}

function focusSelector(focus: NonNullable<MenuCategoryEditor["focus"]>, locale: Locale): string {
  switch (focus.kind) {
    case "row":
      return `[data-category-id="${focus.categoryId}"]`;
    case "names":
      return locale === "ar" ? "#menu-category-name-ar" : "#menu-category-name-fr";
    case "availability":
      return "#menu-category-time-from";
    case "reload":
      return "[data-category-reload]";
  }
}

export function MenuCategoryScreen({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  const translate = useTranslations("menuCategory");
  const controls = useMenuCategoryEditor(merchantId);
  const panel = useRef<HTMLElement>(null);
  const { view, focus } = controls;

  useEffect(() => {
    if (focus) panel.current?.querySelector<HTMLElement>(focusSelector(focus, locale))?.focus();
  }, [focus, locale]);

  return (
    <section className="menu-category-panel" aria-labelledby="menu-category-title" ref={panel}>
      <header className="menu-category-heading">
        <a className="menu-category-secondary" href={`/${locale}/merchant`}>
          {translate("backToRestaurants")}
        </a>
        <h1 id="menu-category-title">{translate("title")}</h1>
        <p>{translate("description")}</p>
      </header>
      {view.kind === "ready" ? (
        <CategoryWorkspace
          merchantId={merchantId}
          snapshot={view.data}
          controls={controls}
          locale={locale}
        />
      ) : (
        <CategoryGate kind={view.kind} reload={controls.reload} locale={locale} />
      )}
    </section>
  );
}
