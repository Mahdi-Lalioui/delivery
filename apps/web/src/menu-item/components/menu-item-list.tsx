import { getLocalizedContent } from "@zaafran/i18n/content";
import { formatAlgiersDate, formatAlgiersTime, formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { ItemAvailability, MenuItem } from "../menu-item-http";
import type { useMenuItemEditor } from "../use-menu-item-editor";
import { itemTags } from "./menu-item-form";

type Controls = ReturnType<typeof useMenuItemEditor>;
type RowControls = Pick<
  Controls,
  | "pending"
  | "openEditor"
  | "duplicate"
  | "setAvailability"
  | "askArchive"
  | "cancelArchive"
  | "confirmArchive"
>;
const availabilityChoices = {
  available: "available",
  end_of_day: "stockUntilDayEnd",
  indefinite: "stockSoldOut",
} as const;

const moderationMessages = {
  unreviewed: "moderationUnreviewed",
  approved: "moderationApproved",
  blocked_pending_review: "moderationBlocked",
  rejected: "moderationRejected",
} as const;

function currentAvailability(item: MenuItem): ItemAvailability {
  if (item.isAvailable) return "available";
  return item.soldOutUntil ? "end_of_day" : "indefinite";
}

function AvailabilityStatus({ item, locale }: { item: MenuItem; locale: Locale }) {
  const translate = useTranslations("menuItem");
  const availability = currentAvailability(item);

  if (item.soldOutUntil) {
    const date = new Date(item.soldOutUntil);
    return (
      <p className="menu-item-status" data-available={item.isAvailable}>
        {translate("soldOutUntil", {
          date: formatAlgiersDate(date, locale),
          time: formatAlgiersTime(date, locale),
        })}
      </p>
    );
  }

  return (
    <p className="menu-item-status" data-available={item.isAvailable}>
      {translate(availabilityChoices[availability])}
    </p>
  );
}

function MenuItemRow({
  item,
  locale,
  controls,
  confirm,
  blocked,
}: {
  item: MenuItem;
  locale: Locale;
  controls: RowControls;
  confirm: boolean;
  blocked: boolean;
}) {
  const translate = useTranslations("menuItem");
  const name = getLocalizedContent(item.names, locale) ?? "";
  const description = getLocalizedContent(item.descriptions, locale);

  return (
    <li id={`menu-item-row-${item.itemId}`} className="menu-item-row" tabIndex={-1}>
      <div className="menu-item-summary">
        <h3>
          <bdi>{name}</bdi>
        </h3>
        <p className="menu-item-price">
          <bdi>{formatDzd(item.priceDzd, locale)}</bdi>
        </p>
      </div>
      {description && (
        <p className="menu-item-hint" dir="auto">
          {description}
        </p>
      )}
      {item.tags.length > 0 && (
        <ul className="menu-item-tags" role="list" aria-label={translate("tags")}>
          {itemTags
            .filter(([tag]) => item.tags.includes(tag))
            .map(([tag, label]) => (
              <li key={tag}>{translate(label)}</li>
            ))}
        </ul>
      )}
      <p className="menu-item-moderation" data-moderation={item.moderationStatus}>
        {translate(moderationMessages[item.moderationStatus])}
      </p>
      <AvailabilityStatus item={item} locale={locale} />
      <select
        className="menu-item-select"
        id={`menu-item-availability-${item.itemId}`}
        aria-label={translate("availabilityLabel", { name })}
        disabled={blocked}
        value={currentAvailability(item)}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "available" || value === "end_of_day" || value === "indefinite") {
            controls.setAvailability(item.itemId, value);
          }
        }}
      >
        {Object.entries(availabilityChoices).map(([value, label]) => (
          <option key={value} value={value}>
            {translate(label)}
          </option>
        ))}
      </select>
      <div className="menu-item-actions">
        <button
          className="menu-item-secondary"
          type="button"
          disabled={blocked}
          aria-label={translate("editLabel", { name })}
          onClick={() => {
            controls.openEditor(item);
          }}
        >
          {translate("edit")}
        </button>
        <button
          className="menu-item-secondary"
          type="button"
          disabled={blocked}
          id={`menu-item-duplicate-${item.itemId}`}
          aria-label={translate("duplicateLabel", { name })}
          onClick={() => {
            controls.duplicate(item.itemId);
          }}
        >
          {translate("duplicate")}
        </button>
        <button
          className="menu-item-secondary"
          type="button"
          disabled={blocked}
          aria-label={translate("archiveLabel", { name })}
          aria-expanded={confirm}
          onClick={() => {
            controls.askArchive(item.itemId);
          }}
        >
          {translate("archive")}
        </button>
      </div>
      {confirm && (
        <div
          className="menu-item-confirm"
          role="group"
          aria-labelledby={`menu-item-prompt-${item.itemId}`}
        >
          <p id={`menu-item-prompt-${item.itemId}`}>{translate("archivePrompt", { name })}</p>
          <div className="menu-item-actions">
            <button
              className="menu-item-secondary"
              type="button"
              disabled={controls.pending}
              id={`menu-item-confirm-${item.itemId}`}
              onClick={controls.cancelArchive}
            >
              {translate("cancel")}
            </button>
            <button
              className="menu-item-danger"
              type="button"
              disabled={controls.pending}
              id={`menu-item-archive-${item.itemId}`}
              onClick={controls.confirmArchive}
            >
              {translate("confirmArchive")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function MenuItemList({
  items,
  locale,
  controls,
}: {
  items: MenuItem[];
  locale: Locale;
  controls: Controls;
}) {
  const translate = useTranslations("menuItem");
  const blocked = controls.pending || controls.editor !== null || controls.archiveTarget !== null;

  return (
    <section className="menu-item-card" aria-labelledby="menu-item-list-title">
      <div className="menu-item-summary">
        <h2 id="menu-item-list-title" tabIndex={-1}>
          {translate("listTitle")}
        </h2>
        <button
          className="menu-item-primary"
          type="button"
          disabled={blocked}
          onClick={() => {
            controls.openEditor();
          }}
        >
          {translate("newItem")}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="menu-item-hint">{translate("empty")}</p>
      ) : (
        <ul className="menu-item-list" role="list" aria-labelledby="menu-item-list-title">
          {items.map((item) => (
            <MenuItemRow
              key={item.itemId}
              item={item}
              locale={locale}
              controls={controls}
              confirm={controls.archiveTarget === item.itemId}
              blocked={blocked}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
