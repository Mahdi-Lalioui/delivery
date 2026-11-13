import { useTranslations } from "next-intl";
import { isOvernightRange, type RangeDraft } from "../clock-ranges";
import { canAddHoursRange, type DayError, type HoursDraft } from "../hours-editor";
import { weekdayKeys } from "./weekday-keys";

type RangeAddress = { weekday: number; index: number };
export interface WeeklyHoursFieldsProps {
  readonly draft: HoursDraft;
  readonly errors: readonly DayError[];
  readonly isDisabled: boolean;
  readonly onChange: (change: RangeAddress & { field: keyof RangeDraft; value: string }) => void;
  readonly onAdd: (weekday: number) => void;
  readonly onRemove: (range: RangeAddress) => void;
}

const errorMessages = { time: "errorTime", overlap: "errorOverlap" } as const;

function RangeRow({
  weekday,
  index,
  range,
  props,
}: RangeAddress & { range: RangeDraft; props: WeeklyHoursFieldsProps }) {
  const translate = useTranslations("merchantHours");
  const day = translate(`weekdays.${weekdayKeys[weekday] ?? "sunday"}`);
  const id = `hours-${String(weekday)}-${String(index)}`;
  const field = (name: keyof RangeDraft) => (
    <span className="hours-time">
      <label htmlFor={`${id}-${name}`}>{translate(`${name}Label`)}</label>
      <input
        id={`${id}-${name}`}
        type="time"
        value={range[name]}
        onChange={(event) => {
          props.onChange({ weekday, index, field: name, value: event.currentTarget.value });
        }}
      />
    </span>
  );
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
        aria-label={translate("removeRange", { opens: range.opens, closes: range.closes, day })}
        onClick={() => {
          props.onRemove({ weekday, index });
        }}
      >
        {translate("remove")}
      </button>
    </li>
  );
}

function DayFields({ weekday, props }: { weekday: number; props: WeeklyHoursFieldsProps }) {
  const translate = useTranslations("merchantHours");
  const ranges = props.draft.weekly.find((day) => day.weekday === weekday)?.ranges ?? [];
  const error = props.errors.find((entry) => entry.weekday === weekday);
  const errorId = `hours-${String(weekday)}-error`;
  return (
    <fieldset className="hours-day" aria-describedby={error ? errorId : undefined}>
      <legend>{translate(`weekdays.${weekdayKeys[weekday] ?? "sunday"}`)}</legend>
      {ranges.length === 0 ? <p className="hours-closed">{translate("closedDay")}</p> : null}
      <ul className="hours-ranges">
        {ranges.map((range, index) => (
          <RangeRow key={index} weekday={weekday} index={index} range={range} props={props} />
        ))}
      </ul>
      {error ? (
        <p id={errorId} role="alert">
          {translate(errorMessages[error.reason])}
        </p>
      ) : null}
      <button
        id={`hours-${String(weekday)}-add`}
        className="menu-item-secondary"
        type="button"
        disabled={!canAddHoursRange(props.draft, weekday)}
        onClick={() => {
          props.onAdd(weekday);
        }}
      >
        {translate("addRange")}
      </button>
    </fieldset>
  );
}

export function WeeklyHoursFields(props: WeeklyHoursFieldsProps) {
  const translate = useTranslations("merchantHours");
  return (
    <fieldset disabled={props.isDisabled} className="hours-week">
      <legend>{translate("weeklyLegend")}</legend>
      {weekdayKeys.map((key, weekday) => (
        <DayFields key={key} weekday={weekday} props={props} />
      ))}
    </fieldset>
  );
}
