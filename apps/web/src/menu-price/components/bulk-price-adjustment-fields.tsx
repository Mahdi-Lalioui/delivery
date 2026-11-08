import { useTranslations } from "next-intl";
import type { BulkPriceControls } from "../bulk-price-controls";
import type { RoundingUnit } from "../bulk-price-form";

const roundingUnits: readonly RoundingUnit[] = [1, 5, 10, 50];

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

function AmountFields({ controls }: { controls: BulkPriceControls }) {
  const translate = useTranslations("menuPrice");
  const { form, changeForm } = controls;
  const isInvalid = form.formError === "invalidAmount";
  return (
    <div className="bulk-price-amount">
      <div className="menu-item-field">
        <label htmlFor="bulk-price-amount">{translate("amountLabel")}</label>
        <div className="bulk-price-money">
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

export function AdjustmentFields({ controls }: { controls: BulkPriceControls }) {
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
