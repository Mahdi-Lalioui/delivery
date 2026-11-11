import { useTranslations } from "next-intl";
import {
  canAddSpecialDate,
  canAddSpecialDateRange,
  isOvernightRange,
  type HoursDraft,
  type RangeDraft,
  type SpecialDateDraft,
  type SpecialDateError,
} from "../hours-editor";
import type { MerchantHoursEditor } from "../use-hours-editor";

type Actions = MerchantHoursEditor["specialDates"];

const errorMessages = {
  date: "errorSpecialDate",
  duplicate: "errorDuplicateDate",
  overlap: "errorOverlap",
  limit: "errorSpecialDateLimit",
  time: "errorTime",
} as const;

function ExceptionRange({
  date,
  index,
  range,
  error,
  actions,
}: {
  date: SpecialDateDraft;
  index: number;
  range: RangeDraft;
  error: SpecialDateError | undefined;
  actions: Actions;
}) {
  const t = useTranslations("merchantHours");
  const dateId = date.id;
  const prefix = `hours-special-${dateId}`;
  return (
    <li className="hours-range">
      {(["opens", "closes"] as const).map((field) => {
        const id = `${prefix}-${String(index)}-${field}`;
        const invalid = error?.reason === "time" && error.index === index && error.field === field;
        return (
          <span className="hours-time" key={field}>
            <label htmlFor={id}>{t(`${field}Label`)}</label>
            <input
              id={id}
              type="time"
              value={range[field]}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${prefix}-error` : undefined}
              onChange={(event) => {
                actions.changeRange({ dateId, index, field, value: event.currentTarget.value });
              }}
            />
          </span>
        );
      })}
      {isOvernightRange(range) && <span className="hours-badge">{t("overnight")}</span>}
      <button
        type="button"
        className="menu-item-secondary"
        aria-label={t("removeRange", { opens: range.opens, closes: range.closes, day: date.date })}
        onClick={() => {
          actions.removeRange({ dateId, index });
        }}
      >
        {t("remove")}
      </button>
    </li>
  );
}

function ExceptionDate({
  date,
  number,
  error,
  canAddRange,
  actions,
}: {
  date: SpecialDateDraft;
  number: number;
  error: SpecialDateError | undefined;
  canAddRange: boolean;
  actions: Actions;
}) {
  const t = useTranslations("merchantHours");
  const dateId = date.id;
  const prefix = `hours-special-${dateId}`;
  const errorId = `${prefix}-error`;
  const invalid = error?.reason === "date" || error?.reason === "duplicate";
  return (
    <fieldset className="hours-day" aria-describedby={error && errorId}>
      <legend>{t("specialDateTitle", { number: String(number) })}</legend>
      <div className="hours-range">
        <span className="hours-time">
          <label htmlFor={`${prefix}-date`}>{t("specialDateLabel")}</label>
          <input
            id={`${prefix}-date`}
            type="date"
            value={date.date}
            required
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => {
              actions.changeDate({ dateId, value: event.currentTarget.value });
            }}
          />
        </span>
        <button
          type="button"
          className="menu-item-secondary"
          onClick={() => {
            actions.removeDate(dateId);
          }}
        >
          {t("removeSpecialDate")}
        </button>
      </div>
      {date.ranges.length === 0 && <p className="hours-closed">{t("closedDay")}</p>}
      <ul className="hours-ranges">
        {date.ranges.map((range, index) => (
          <ExceptionRange
            key={index}
            date={date}
            index={index}
            range={range}
            error={error}
            actions={actions}
          />
        ))}
      </ul>
      {error && (
        <p id={errorId} role="alert" className="hours-error">
          {t(errorMessages[error.reason])}
        </p>
      )}
      <button
        id={`${prefix}-add-range`}
        type="button"
        className="menu-item-secondary"
        disabled={!canAddRange}
        onClick={() => {
          actions.addRange(dateId);
        }}
      >
        {t("addRange")}
      </button>
    </fieldset>
  );
}

export function SpecialDateFields({
  draft,
  errors,
  isDisabled,
  actions,
}: {
  draft: HoursDraft;
  errors: readonly SpecialDateError[];
  isDisabled: boolean;
  actions: Actions;
}) {
  const t = useTranslations("merchantHours");
  return (
    <fieldset disabled={isDisabled} className="hours-week hours-special-dates">
      <legend>{t("specialDatesLegend")}</legend>
      <p className="hours-closed">{t("specialDatesHint")}</p>
      {draft.specialDates.map((date, index) => (
        <ExceptionDate
          key={date.id}
          date={date}
          number={index + 1}
          error={errors.find(({ dateId }) => dateId === date.id)}
          canAddRange={canAddSpecialDateRange(draft, date.id)}
          actions={actions}
        />
      ))}
      <button
        id="hours-special-add"
        type="button"
        className="menu-item-secondary"
        disabled={!canAddSpecialDate(draft)}
        onClick={() => {
          actions.addDate();
        }}
      >
        {t("addSpecialDate")}
      </button>
    </fieldset>
  );
}
