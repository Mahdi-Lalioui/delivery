import { useTranslations } from "next-intl";
import { isOvernightRange, maxRangesPerDay, type RangeDraft } from "../clock-ranges";
import {
  canAddSpecialDate,
  type SpecialDateDraft,
  type SpecialDateError,
} from "../special-dates-editor";

type RangeAddress = { index: number; rangeIndex: number };
export interface SpecialDatesFieldsProps {
  readonly drafts: readonly SpecialDateDraft[];
  readonly errors: readonly SpecialDateError[];
  readonly isDisabled: boolean;
  readonly onDateChange: (change: { index: number; date: string }) => void;
  readonly onRangeChange: (
    change: RangeAddress & { field: keyof RangeDraft; value: string },
  ) => void;
  readonly onAddDate: () => void;
  readonly onRemoveDate: (index: number) => void;
  readonly onAddRange: (index: number) => void;
  readonly onRemoveRange: (range: RangeAddress) => void;
}
type EntryProps = { index: number; entry: SpecialDateDraft; props: SpecialDatesFieldsProps };

const errorMessages = {
  date: "errorDate",
  duplicate: "errorDuplicate",
  time: "errorTime",
  overlap: "errorOverlap",
} as const;

function SpecialRangeRow({ index, rangeIndex, entry, props }: EntryProps & { rangeIndex: number }) {
  const translate = useTranslations("merchantHours");
  const range = entry.ranges[rangeIndex] ?? { opens: "", closes: "" };
  const id = `special-date-${String(index)}-${String(rangeIndex)}`;
  const field = (name: keyof RangeDraft) => (
    <span className="hours-time">
      <label htmlFor={`${id}-${name}`}>{translate(`${name}Label`)}</label>
      <input
        id={`${id}-${name}`}
        type="time"
        value={range[name]}
        onChange={(event) => {
          const { value } = event.currentTarget;
          props.onRangeChange({ index, rangeIndex, field: name, value });
        }}
      />
    </span>
  );
  const label = translate("removeSpecialRange", { ...range, date: entry.date });
  return (
    <li className="hours-range">
      {field("opens")}
      {field("closes")}
      {isOvernightRange(range) ? (
        <span className="hours-badge">{translate("overnight")}</span>
      ) : null}
      <button
        className="menu-item-secondary"
        type="button"
        aria-label={label}
        onClick={() => {
          props.onRemoveRange({ index, rangeIndex });
        }}
      >
        {translate("remove")}
      </button>
    </li>
  );
}

function EntryActions({ index, entry, props }: EntryProps) {
  const translate = useTranslations("merchantHours");
  return (
    <div className="menu-item-actions">
      <button
        id={`special-date-${String(index)}-add`}
        className="menu-item-secondary"
        type="button"
        disabled={entry.ranges.length >= maxRangesPerDay}
        onClick={() => {
          props.onAddRange(index);
        }}
      >
        {translate("addRange")}
      </button>
      <button
        className="menu-item-secondary"
        type="button"
        aria-label={translate("removeSpecialDate", { date: entry.date })}
        onClick={() => {
          props.onRemoveDate(index);
        }}
      >
        {translate("remove")}
      </button>
    </div>
  );
}

function SpecialDateEntry({ index, entry, props }: EntryProps) {
  const translate = useTranslations("merchantHours");
  const id = `special-date-${String(index)}`;
  const error = props.errors.find((candidate) => candidate.index === index);
  return (
    <li className="hours-day">
      <span className="hours-time">
        <label htmlFor={`${id}-date`}>{translate("specialDateLabel")}</label>
        <input
          id={`${id}-date`}
          type="date"
          value={entry.date}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            props.onDateChange({ index, date: event.currentTarget.value });
          }}
        />
      </span>
      {entry.ranges.length === 0 ? (
        <p className="hours-closed">{translate("specialClosed")}</p>
      ) : null}
      <ul className="hours-ranges">
        {entry.ranges.map((_, rangeIndex) => (
          <SpecialRangeRow
            key={rangeIndex}
            index={index}
            rangeIndex={rangeIndex}
            entry={entry}
            props={props}
          />
        ))}
      </ul>
      {error ? (
        <p id={`${id}-error`} role="alert">
          {translate(errorMessages[error.reason])}
        </p>
      ) : null}
      <EntryActions index={index} entry={entry} props={props} />
    </li>
  );
}

export function SpecialDatesFields(props: SpecialDatesFieldsProps) {
  const translate = useTranslations("merchantHours");
  return (
    <fieldset disabled={props.isDisabled} className="hours-week">
      <legend>{translate("specialLegend")}</legend>
      <p className="menu-item-hint">{translate("specialHint")}</p>
      {props.drafts.length === 0 ? (
        <p className="hours-closed">{translate("specialEmpty")}</p>
      ) : null}
      <ul className="hours-ranges">
        {props.drafts.map((entry, index) => (
          <SpecialDateEntry key={index} index={index} entry={entry} props={props} />
        ))}
      </ul>
      <button
        id="special-date-add"
        className="menu-item-secondary"
        type="button"
        disabled={!canAddSpecialDate(props.drafts)}
        onClick={props.onAddDate}
      >
        {translate("addSpecialDate")}
      </button>
    </fieldset>
  );
}
