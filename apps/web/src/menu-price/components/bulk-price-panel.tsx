import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { BulkPriceState } from "../bulk-price-flow";
import type { BulkPriceSelection } from "../bulk-price-http";

type Mode = BulkPriceSelection["adjustment"]["kind"];
type RoundingUnit = BulkPriceSelection["roundingUnit"];
type Direction = "raise" | "lower";

interface BulkPriceForm {
  readonly selectedIds: ReadonlySet<string>;
  readonly direction: Direction;
  readonly mode: Mode;
  readonly amount: string;
  readonly roundingUnit: RoundingUnit;
  readonly formError: "invalidAmount" | "noSelection" | null;
}

export interface BulkPriceControls {
  readonly form: BulkPriceForm;
  readonly state: BulkPriceState;
  readonly isUndoOffered: boolean;
  readonly pending: boolean;
  readonly changeForm: (
    patch: Partial<Pick<BulkPriceForm, "direction" | "mode" | "amount" | "roundingUnit">>,
  ) => void;
  readonly toggleItem: (itemId: string) => void;
  readonly toggleAll: () => void;
  readonly preview: () => void;
  readonly apply: () => void;
  readonly undo: () => void;
  readonly reset: () => void;
}

interface PanelItem {
  readonly itemId: string;
  readonly name: string;
  readonly priceDzd: number;
}

const roundingUnits: readonly RoundingUnit[] = [1, 5, 10, 50];

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
  return (
    <fieldset className="bulk-price-fieldset">
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

function RadioPair<Value extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="bulk-price-fieldset bulk-price-inline">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label className="bulk-price-choice" key={option.value}>
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => {
              onChange(option.value);
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function AmountFields({ controls }: Pick<PanelProps, "controls">) {
  const translate = useTranslations("menuPrice");
  const { form, changeForm } = controls;
  const isInvalid = form.formError === "invalidAmount";
  return (
    <div className="bulk-price-amount">
      <div className="menu-item-field">
        <label htmlFor="bulk-price-amount">{translate("amountLabel")}</label>
        <div className="menu-item-money">
          <input
            id="bulk-price-amount"
            type="text"
            dir="ltr"
            inputMode={form.mode === "percent" ? "decimal" : "numeric"}
            value={form.amount}
            aria-invalid={isInvalid || undefined}
            aria-describedby={isInvalid ? "bulk-price-amount-error" : undefined}
            onChange={(event) => {
              changeForm({ amount: event.target.value });
            }}
          />
          <span>{translate(form.mode === "percent" ? "percentSuffix" : "dinarSuffix")}</span>
        </div>
      </div>
      <div className="menu-item-field">
        <label htmlFor="bulk-price-rounding">{translate("roundingLabel")}</label>
        <select
          id="bulk-price-rounding"
          value={form.roundingUnit}
          onChange={(event) => {
            const unit = roundingUnits.find((value) => String(value) === event.target.value);
            if (unit) changeForm({ roundingUnit: unit });
          }}
        >
          {roundingUnits.map((unit) => (
            <option key={unit} value={unit}>
              {translate("roundingOption", { unit })}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AdjustmentFields({ controls }: Pick<PanelProps, "controls">) {
  const translate = useTranslations("menuPrice");
  const { form, changeForm } = controls;
  return (
    <>
      <RadioPair
        legend={translate("directionLegend")}
        name="bulk-price-direction"
        value={form.direction}
        options={[
          { value: "raise", label: translate("raise") },
          { value: "lower", label: translate("lower") },
        ]}
        onChange={(direction) => {
          changeForm({ direction });
        }}
      />
      <RadioPair
        legend={translate("modeLegend")}
        name="bulk-price-mode"
        value={form.mode}
        options={[
          { value: "percent", label: translate("percent") },
          { value: "fixed", label: translate("fixed") },
        ]}
        onChange={(mode) => {
          changeForm({ mode });
        }}
      />
      <AmountFields controls={controls} />
    </>
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
        <p id="bulk-price-amount-error" className="menu-item-error" role="alert">
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
