"use client";

import { getLocalizedContent } from "@zaafran/i18n/content";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useRef, useState, type PointerEvent } from "react";
import type { MenuCategory } from "../menu-category-http";
import type { MenuCategoryEditor } from "../use-menu-category-editor";

interface CategoryListProps {
  categories: readonly MenuCategory[];
  locale: Locale;
  controls: MenuCategoryEditor;
}

type DragStart = { pointerId: number; categoryId: string };

interface CategoryRowProps {
  category: MenuCategory;
  locale: Locale;
  disabled: boolean;
  selected: boolean;
  dragging: boolean;
  isDropTarget: boolean;
  before: string | undefined;
  after: string | undefined;
  onEdit: (category: MenuCategory) => void;
  onMove: (categoryId: string, targetId: string) => Promise<void>;
  onStartDrag: (event: PointerEvent<HTMLSpanElement>, categoryId: string) => void;
  onDrag: (event: PointerEvent<HTMLSpanElement>) => void;
  onFinishDrag: (event: PointerEvent<HTMLSpanElement>) => void;
  onCancelDrag: () => void;
}

function CategoryAvailability({ availability }: Pick<MenuCategory, "availability">) {
  const translate = useTranslations("menuCategory");
  if (availability === null) return <p>{translate("allDay")}</p>;

  const { from, to } = availability;
  return (
    <p>
      {translate(from > to ? "overnightTime" : "windowTime", {
        from: `\u2066${from}\u2069`,
        to: `\u2066${to}\u2069`,
      })}
    </p>
  );
}

function CategoryRow({
  category,
  locale,
  disabled,
  selected,
  dragging,
  isDropTarget,
  before,
  after,
  onEdit,
  onMove,
  onStartDrag,
  onDrag,
  onFinishDrag,
  onCancelDrag,
}: CategoryRowProps) {
  const translate = useTranslations("menuCategory");
  const { categoryId, names, availability } = category;
  const name = getLocalizedContent(names, locale) ?? "";

  return (
    <li
      className="menu-category-row"
      data-category-id={categoryId}
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      data-dragging={dragging || undefined}
      data-drop-target={isDropTarget || undefined}
      tabIndex={-1}
    >
      <div className="menu-category-row-summary">
        <span
          className="menu-category-grip"
          aria-hidden="true"
          onPointerDown={(event) => {
            onStartDrag(event, categoryId);
          }}
          onPointerMove={onDrag}
          onPointerUp={onFinishDrag}
          onPointerCancel={onCancelDrag}
          onLostPointerCapture={onCancelDrag}
        />
        <div>
          <h3>
            <bdi>{name}</bdi>
          </h3>
          <CategoryAvailability availability={availability} />
        </div>
      </div>
      <div className="menu-category-actions">
        <button
          className="menu-category-secondary"
          type="button"
          aria-label={translate("moveUpLabel", { name })}
          disabled={disabled || before === undefined}
          onClick={() => {
            if (before !== undefined) void onMove(categoryId, before);
          }}
        >
          {translate("moveUp")}
        </button>
        <button
          className="menu-category-secondary"
          type="button"
          aria-label={translate("moveDownLabel", { name })}
          disabled={disabled || after === undefined}
          onClick={() => {
            if (after !== undefined) void onMove(categoryId, after);
          }}
        >
          {translate("moveDown")}
        </button>
        <button
          className="menu-category-secondary"
          type="button"
          aria-label={translate("editCategoryLabel", { name })}
          disabled={disabled}
          onClick={() => {
            onEdit(category);
          }}
        >
          {translate("editCategory")}
        </button>
      </div>
    </li>
  );
}

export function CategoryList({ categories, locale, controls }: CategoryListProps) {
  const translate = useTranslations("menuCategory");
  const list = useRef<HTMLUListElement>(null);
  const drag = useRef<DragStart | undefined>(undefined);
  const [dragging, setDragging] = useState<string>();
  const [dropTarget, setDropTarget] = useState<string>();
  const disabled = controls.isSaving || controls.revisionConflict;

  function getTarget(event: PointerEvent<HTMLSpanElement>) {
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-category-id]");
    return row && list.current?.contains(row) ? row.dataset.categoryId : undefined;
  }

  function startDrag(event: PointerEvent<HTMLSpanElement>, categoryId: string) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { categoryId, pointerId: event.pointerId };
    setDragging(categoryId);
  }

  function observeDrag(event: PointerEvent<HTMLSpanElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    const target = getTarget(event);
    setDropTarget(target === drag.current.categoryId ? undefined : target);
  }

  function cancelDrag() {
    drag.current = undefined;
    setDragging(undefined);
    setDropTarget(undefined);
  }

  function finishDrag(event: PointerEvent<HTMLSpanElement>) {
    const origin = drag.current;
    if (origin?.pointerId !== event.pointerId) return;
    const target = getTarget(event);
    cancelDrag();
    if (target !== undefined) void controls.move(origin.categoryId, target);
  }

  return (
    <section className="menu-category-card" aria-labelledby="menu-category-list-title">
      <h2 id="menu-category-list-title">{translate("categoryList")}</h2>
      {categories.length === 0 ? (
        <p>{translate("empty")}</p>
      ) : (
        <>
          <p className="menu-category-hint">{translate("orderHint")}</p>
          <ul className="menu-category-list" role="list" ref={list}>
            {categories.map((category, index) => (
              <CategoryRow
                key={category.categoryId}
                category={category}
                locale={locale}
                disabled={disabled}
                selected={controls.selectedId === category.categoryId}
                dragging={dragging === category.categoryId}
                isDropTarget={dropTarget === category.categoryId}
                before={categories[index - 1]?.categoryId}
                after={categories[index + 1]?.categoryId}
                onEdit={controls.edit}
                onMove={controls.move}
                onStartDrag={startDrag}
                onDrag={observeDrag}
                onFinishDrag={finishDrag}
                onCancelDrag={cancelDrag}
              />
            ))}
          </ul>
        </>
      )}
      <button
        className="menu-category-secondary"
        type="button"
        disabled={disabled}
        onClick={() => {
          controls.edit();
        }}
      >
        {translate("newCategory")}
      </button>
    </section>
  );
}
