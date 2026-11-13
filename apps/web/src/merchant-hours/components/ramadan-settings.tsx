import { merchantRamadanInput } from "@zaafran/contracts/merchant-hours";
import { useTranslations } from "next-intl";
import type { RangeDraft } from "../clock-ranges";
import type { RamadanDraft, RamadanError } from "../ramadan-editor";

const prayerMethods = merchantRamadanInput.shape.method.options;

interface RamadanSettingsProps {
  readonly draft: RamadanDraft;
  readonly errors: readonly RamadanError[];
  readonly onEdit: (draft: RamadanDraft) => void;
  readonly onSuhoorToggle: (isOn: boolean) => void;
}

function readMethod(value: string): RamadanDraft["method"] | undefined {
  return prayerMethods.find((method) => method === value);
}

function SuhoorWindow({ suhoor, props }: { suhoor: RangeDraft; props: RamadanSettingsProps }) {
  const translate = useTranslations("merchantHours");
  const field = (name: keyof RangeDraft) => (
    <span className="hours-time">
      <label htmlFor={`ramadan-suhoor-${name}`}>{translate(`${name}Label`)}</label>
      <input
        id={`ramadan-suhoor-${name}`}
        type="time"
        value={suhoor[name]}
        onChange={(event) => {
          const next = { ...suhoor, [name]: event.currentTarget.value };
          props.onEdit({ ...props.draft, suhoor: next });
        }}
      />
    </span>
  );
  return (
    <div className="hours-range">
      {field("opens")}
      {field("closes")}
    </div>
  );
}

export function RamadanSettings(props: RamadanSettingsProps) {
  const translate = useTranslations("merchantHours");
  const { draft, errors } = props;
  const hasSuhoorError = errors.some((error) => error.field === "suhoor");
  const hasAdjustmentError = errors.some((error) => error.field === "adjustment");
  return (
    <div className="hours-settings">
      <fieldset
        className="hours-day"
        aria-describedby={hasSuhoorError ? "ramadan-suhoor-error" : undefined}
      >
        <legend>{translate("suhoorLegend")}</legend>
        <span className="hours-check">
          <input
            id="ramadan-suhoor-on"
            type="checkbox"
            checked={draft.suhoor !== null}
            onChange={(event) => {
              props.onSuhoorToggle(event.currentTarget.checked);
            }}
          />
          <label htmlFor="ramadan-suhoor-on">{translate("suhoorToggle")}</label>
        </span>
        {draft.suhoor ? <SuhoorWindow suhoor={draft.suhoor} props={props} /> : null}
        {hasSuhoorError ? (
          <p id="ramadan-suhoor-error" role="alert">
            {translate("errorSuhoor")}
          </p>
        ) : null}
      </fieldset>
      <span className="hours-time">
        <label htmlFor="ramadan-method">{translate("methodLabel")}</label>
        <select
          id="ramadan-method"
          value={draft.method}
          onChange={(event) => {
            const method = readMethod(event.currentTarget.value);
            if (method) props.onEdit({ ...draft, method });
          }}
        >
          {prayerMethods.map((method) => (
            <option key={method} value={method}>
              {translate(`methods.${method}`)}
            </option>
          ))}
        </select>
      </span>
      <span className="hours-time">
        <label htmlFor="ramadan-adjustment">{translate("adjustmentLabel")}</label>
        <input
          id="ramadan-adjustment"
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={draft.adjustment}
          aria-describedby={hasAdjustmentError ? "ramadan-adjustment-error" : undefined}
          onChange={(event) => {
            props.onEdit({ ...draft, adjustment: event.currentTarget.value });
          }}
        />
        {hasAdjustmentError ? (
          <span id="ramadan-adjustment-error" className="hours-error" role="alert">
            {translate("errorAdjustment")}
          </span>
        ) : null}
      </span>
    </div>
  );
}
