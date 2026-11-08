import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { BulkPriceControls } from "../bulk-price-controls";
import { AdjustmentFields } from "./bulk-price-adjustment-fields";

export type { BulkPriceControls } from "../bulk-price-controls";

interface PanelItem {
  readonly itemId: string;
  readonly name: string;
  readonly priceDzd: number;
}

const errorIds = {
  invalidAmount: "bulk-price-amount-error",
  noSelection: "bulk-price-selection-error",
} as const;

const failureMessages = {
  "undo-expired": "failureUndoExpired",
  "price-changed": "failurePriceChanged",
  "already-undone": "failureAlreadyUndone",
  "revision-conflict": "failureRevisionConflict",
  "session-changed": "failureSessionChanged",
  "invalid-change": "failureInvalidChange",
  "sign-in": "failureSignIn",
  forbidden: "failureForbidden",
  "rate-limited": "failureRateLimited",
  error: "failureError",
} as const;

function ItemChoices({ items, locale, controls }: PanelProps) {
  const translate = useTranslations("menuPrice");
  const { form, toggleItem, toggleAll } = controls;
  const isAllSelected = items.every((item) => form.selectedIds.has(item.itemId));
  const isEmpty = form.formError === "noSelection";
  return (
    <fieldset
      className="bulk-price-fieldset"
      aria-describedby={isEmpty ? "bulk-price-selection-error" : undefined}
    >
      <legend>{translate("itemsLegend")}</legend>
      <label className="bulk-price-choice">
        <input type="checkbox" checked={isAllSelected} onChange={toggleAll} />
        {translate("selectAll")}
      </label>
      {items.map((item) => (
        <label className="bulk-price-choice" key={item.itemId}>
          <input
            id={`bulk-price-item-${item.itemId}`}
            type="checkbox"
            checked={form.selectedIds.has(item.itemId)}
            onChange={() => {
              toggleItem(item.itemId);
            }}
          />
          <bdi>{item.name}</bdi>
          <bdi className="bulk-price-current">{formatDzd(item.priceDzd, locale)}</bdi>
        </label>
      ))}
    </fieldset>
  );
}

function PreviewTable({ items, locale, controls }: PanelProps) {
  const translate = useTranslations("menuPrice");
  const { state } = controls;
  if (state.kind !== "previewed" && state.kind !== "applying") return null;
  const names = new Map(items.map((item) => [item.itemId, item.name]));
  return (
    <table className="bulk-price-table">
      <caption>{translate("previewCaption")}</caption>
      <thead>
        <tr>
          <th scope="col">{translate("itemColumn")}</th>
          <th scope="col">{translate("oldColumn")}</th>
          <th scope="col">{translate("newColumn")}</th>
        </tr>
      </thead>
      <tbody>
        {state.preview.items.map((row) => (
          <tr key={row.itemId}>
            <th scope="row">
              <bdi>{names.get(row.itemId) ?? ""}</bdi>
            </th>
            <td>
              <bdi>{formatDzd(row.oldPriceDzd, locale)}</bdi>
            </td>
            <td>
              <bdi>{formatDzd(row.newPriceDzd, locale)}</bdi>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Actions({ controls }: Pick<PanelProps, "controls">) {
  const translate = useTranslations("menuPrice");
  const { state, pending, isUndoOffered } = controls;
  if (state.kind === "applied" || state.kind === "undoing") {
    return (
      <div className="bulk-price-actions">
        <p role="status">{translate("applied")}</p>
        {isUndoOffered && !state.isUndoClosed && (
          <button
            className="menu-item-secondary"
            type="button"
            disabled={pending}
            onClick={controls.undo}
          >
            {translate("undo")}
          </button>
        )}
      </div>
    );
  }
  if (state.kind === "undone") return <p role="status">{translate("undone")}</p>;
  const hasPreview = state.kind === "previewed" || state.kind === "applying";
  return (
    <div className="bulk-price-actions">
      <button
        className="menu-item-secondary"
        type="button"
        disabled={pending}
        onClick={controls.preview}
      >
        {translate("preview")}
      </button>
      {hasPreview && (
        <button
          className="menu-item-primary"
          type="button"
          disabled={pending}
          onClick={controls.apply}
        >
          {translate("apply")}
        </button>
      )}
    </div>
  );
}

function Problems({ controls }: Pick<PanelProps, "controls">) {
  const translate = useTranslations("menuPrice");
  const { state, form } = controls;
  const failure = "failure" in state ? state.failure : undefined;
  return (
    <>
      {form.formError && (
        <p id={errorIds[form.formError]} className="menu-item-error" role="alert">
          {translate(form.formError)}
        </p>
      )}
      {failure && (
        <p className="menu-item-error" role="alert">
          {translate(failureMessages[failure])}
        </p>
      )}
    </>
  );
}

interface PanelProps {
  readonly items: readonly PanelItem[];
  readonly locale: Locale;
  readonly controls: BulkPriceControls;
}

export function BulkPricePanel(props: PanelProps) {
  const translate = useTranslations("menuPrice");
  const isLocked =
    props.controls.state.kind !== "editing" && props.controls.state.kind !== "previewed";
  return (
    <section className="menu-item-card bulk-price-panel" aria-labelledby="bulk-price-title">
      <h2 id="bulk-price-title">{translate("title")}</h2>
      <p>{translate("description")}</p>
      <fieldset className="bulk-price-fieldset" disabled={isLocked || props.controls.pending}>
        <ItemChoices {...props} />
        <AdjustmentFields controls={props.controls} />
      </fieldset>
      <Problems controls={props.controls} />
      <PreviewTable {...props} />
      <Actions controls={props.controls} />
    </section>
  );
}
