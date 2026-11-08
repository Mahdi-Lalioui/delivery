"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { AdminHeldItemReview } from "./admin-held-item-review";
import type { HeldItem } from "./admin-moderation-http";
import { useAdminHeldItems, type AdminHeldItemsState } from "./use-admin-held-items";

type AdminLocale = "fr" | "en";

const categoryKeys = {
  alcohol: "categoryAlcohol",
  tobacco: "categoryTobacco",
  medicine: "categoryMedicine",
  gambling: "categoryGambling",
} as const;

function itemTitle(item: HeldItem, locale: AdminLocale): string {
  const { names } = item;
  return names[locale] ?? names.fr ?? names.ar ?? names.en ?? item.itemId;
}

function HeldNotice({ state }: { state: AdminHeldItemsState }) {
  const translate = useTranslations("adminModeration");
  const message = useRef<HTMLParagraphElement>(null);
  const notice = state.view.kind === "session-changed" ? "sessionChanged" : state.notice;
  const canRefresh = notice === "stale" || notice === "sessionChanged";

  useEffect(() => {
    if (canRefresh) message.current?.focus();
  }, [canRefresh]);

  if (!notice) return null;
  if (notice === "approved" || notice === "rejected") {
    return (
      <p className="admin-merchant-success" role="status">
        {translate(notice)}
      </p>
    );
  }
  return (
    <div className="admin-merchant-notice">
      <p className="admin-merchant-error" ref={message} tabIndex={-1} role="alert">
        {translate(notice)}
      </p>
      {canRefresh && (
        <button className="admin-merchant-button" type="button" onClick={state.refresh}>
          {translate("refresh")}
        </button>
      )}
    </div>
  );
}

function Categories({ item }: { item: HeldItem }) {
  const translate = useTranslations("adminModeration");
  if (item.matches.length === 0) return <>{translate("noMatches")}</>;
  return (
    <ul className="admin-merchant-cuisines">
      {item.matches.map((category) => (
        <li key={category}>{translate(categoryKeys[category])}</li>
      ))}
    </ul>
  );
}

function HeldRow({ item, state, locale }: RowProps) {
  return (
    <tr>
      <th scope="row">
        <button
          type="button"
          className="admin-merchant-row-action"
          disabled={state.isSaving}
          aria-pressed={state.item?.itemId === item.itemId}
          onClick={() => {
            state.select(item.itemId);
          }}
        >
          <bdi>{itemTitle(item, locale)}</bdi>
        </button>
      </th>
      <td>
        <bdi>{item.restaurantName}</bdi>
      </td>
      <td>
        <Categories item={item} />
      </td>
    </tr>
  );
}

type RowProps = { item: HeldItem; state: AdminHeldItemsState; locale: AdminLocale };

function HeldTable({ state, locale }: { state: AdminHeldItemsState; locale: AdminLocale }) {
  const translate = useTranslations("adminModeration");
  if (state.view.kind !== "ready") return null;
  const { items, nextCursor } = state.view;

  return (
    <div className="admin-merchant-list">
      {items.length === 0 && nextCursor === null && <p>{translate("empty")}</p>}
      {items.length > 0 && (
        <table aria-label={translate("title")} className="admin-merchant-table">
          <thead>
            <tr>
              <th scope="col">{translate("item")}</th>
              <th scope="col">{translate("restaurant")}</th>
              <th scope="col">{translate("matches")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <HeldRow key={item.itemId} item={item} state={state} locale={locale} />
            ))}
          </tbody>
        </table>
      )}
      {nextCursor !== null && (
        <button
          className="admin-merchant-button"
          type="button"
          disabled={state.isPaging || state.isSaving}
          onClick={state.loadMore}
        >
          {translate(state.isPaging ? "loading" : "loadMore")}
        </button>
      )}
    </div>
  );
}

function HeldContent({ state, locale }: { state: AdminHeldItemsState; locale: AdminLocale }) {
  const translate = useTranslations("adminModeration");

  switch (state.view.kind) {
    case "session-changed":
      return null;
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "sign-in":
      return (
        <div className="admin-merchant-notice">
          <p role="alert">{translate("signInRequired")}</p>
          <a
            className="admin-merchant-button"
            href={`/${locale}/sign-in?continue=admin-moderation`}
          >
            {translate("signIn")}
          </a>
        </div>
      );
    case "error":
      return (
        <div className="admin-merchant-notice">
          <p className="admin-merchant-error" role="alert">
            {translate("loadError")}
          </p>
          <button className="admin-merchant-button" type="button" onClick={state.refresh}>
            {translate("retry")}
          </button>
        </div>
      );
    case "ready":
      return (
        <div className="admin-merchant-workspace">
          <HeldTable state={state} locale={locale} />
          {state.item ? (
            <AdminHeldItemReview
              key={state.item.itemId}
              item={state.item}
              title={itemTitle(state.item, locale)}
              state={state}
            />
          ) : state.view.items.length > 0 ? (
            <p className="admin-merchant-placeholder">{translate("selectItem")}</p>
          ) : null}
        </div>
      );
  }
}

/** ADM-04: the admin queue of menu items held by the prohibited-goods screen. */
export function AdminHeldItems({ locale }: { locale: AdminLocale }) {
  const translate = useTranslations("adminModeration");
  const state = useAdminHeldItems();
  const heading = useRef<HTMLHeadingElement>(null);
  const { notice } = state;

  useEffect(() => {
    if (notice === "approved" || notice === "rejected") heading.current?.focus();
  }, [notice]);

  return (
    <section className="admin-merchant" aria-labelledby="admin-moderation-title">
      <header className="admin-merchant-heading">
        <h1 ref={heading} id="admin-moderation-title" tabIndex={-1}>
          {translate("title")}
        </h1>
        <p>{translate("intro")}</p>
      </header>
      <HeldNotice state={state} />
      <HeldContent state={state} locale={locale} />
    </section>
  );
}
