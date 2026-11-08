import { useTranslations } from "next-intl";
import {
  canAddRamadanRange,
  formatMaghribOffset,
  switchEndpointKind,
  toggleRamadanSuhoor,
  updateRamadanEndpoint,
  type EndpointDraft,
  type RamadanDraft,
  type RamadanError,
} from "../ramadan-editor";
import { RamadanSettings } from "./ramadan-settings";
import { weekdayKeys } from "./weekday-keys";

type RangeAddress = { weekday: number; index: number };
type RamadanRange = RamadanDraft["weekly"][number]["ranges"][number];
export interface RamadanFieldsProps {
  readonly draft: RamadanDraft;
  readonly errors: readonly RamadanError[];
  readonly isDisabled: boolean;
  readonly onEdit: (draft: RamadanDraft) => void;
  readonly onAdd: (weekday: number) => void;
  readonly onRemove: (range: RangeAddress) => void;
}

function EndpointFields({
  address,
  end,
  endpoint,
  props,
}: {
  address: RangeAddress;
  end: keyof RamadanRange;
  endpoint: EndpointDraft;
  props: RamadanFieldsProps;
}) {
  const translate = useTranslations("merchantHours");
  const id = `ramadan-${String(address.weekday)}-${String(address.index)}-${end}`;
  const edit = (next: EndpointDraft) => {
    props.onEdit(updateRamadanEndpoint(props.draft, { ...address, end, endpoint: next }));
  };
  return (
    <fieldset className="hours-endpoint">
      <legend>{translate(`${end}Label`)}</legend>
      <span className="hours-time">
        <label htmlFor={`${id}-kind`}>{translate("kindLabel")}</label>
        <select
          id={`${id}-kind`}
          value={endpoint.kind}
          onChange={(event) => {
            const kind = event.currentTarget.value === "clock" ? "clock" : "maghrib";
            edit(switchEndpointKind(endpoint, kind));
          }}
        >
          <option value="maghrib">{translate("kindMaghrib")}</option>
          <option value="clock">{translate("kindClock")}</option>
        </select>
      </span>
      {endpoint.kind === "maghrib" ? (
        <span className="hours-time">
          <label htmlFor={`${id}-offset`}>{translate("offsetLabel")}</label>
          <input
            id={`${id}-offset`}
            type="text"
            inputMode="numeric"
            dir="ltr"
            aria-describedby={`${id}-hint`}
            value={endpoint.offset}
            onChange={(event) => {
              edit({ kind: "maghrib", offset: event.currentTarget.value });
            }}
          />
          <span id={`${id}-hint`} className="hours-closed">
            {translate("offsetHint")}
          </span>
        </span>
      ) : (
        <span className="hours-time">
          <label htmlFor={`${id}-time`}>{translate("timeLabel")}</label>
          <input
            id={`${id}-time`}
            type="time"
            value={endpoint.time}
            onChange={(event) => {
              edit({ kind: "clock", time: event.currentTarget.value });
            }}
          />
        </span>
      )}
    </fieldset>
  );
}

function useEndpointText() {
  const translate = useTranslations("merchantHours");
  return (endpoint: EndpointDraft) => {
    if (endpoint.kind === "clock") return endpoint.time;
    const offset = formatMaghribOffset(endpoint.offset);
    return offset ? translate("endpointMaghribOffset", { offset }) : translate("endpointMaghrib");
  };
}

function RamadanRangeRow({
  address,
  range,
  props,
}: {
  address: RangeAddress;
  range: RamadanRange;
  props: RamadanFieldsProps;
}) {
  const translate = useTranslations("merchantHours");
  const describe = useEndpointText();
  const day = translate(`weekdays.${weekdayKeys[address.weekday] ?? "sunday"}`);
  const names = { opens: describe(range.opens), closes: describe(range.closes), day };
  return (
    <li className="hours-range">
      <EndpointFields address={address} end="opens" endpoint={range.opens} props={props} />
      <EndpointFields address={address} end="closes" endpoint={range.closes} props={props} />
      <button
        className="menu-item-secondary"
        type="button"
        aria-label={translate("removeRange", names)}
        onClick={() => {
          props.onRemove(address);
        }}
      >
        {translate("remove")}
      </button>
    </li>
  );
}

function RamadanDay({ weekday, props }: { weekday: number; props: RamadanFieldsProps }) {
  const translate = useTranslations("merchantHours");
  const ranges = props.draft.weekly.find((day) => day.weekday === weekday)?.ranges ?? [];
  const hasError = props.errors.some((error) => error.field === "day" && error.weekday === weekday);
  const errorId = `ramadan-${String(weekday)}-error`;
  return (
    <fieldset className="hours-day" aria-describedby={hasError ? errorId : undefined}>
      <legend>{translate(`weekdays.${weekdayKeys[weekday] ?? "sunday"}`)}</legend>
      {ranges.length === 0 ? <p className="hours-closed">{translate("closedDay")}</p> : null}
      <ul className="hours-ranges">
        {ranges.map((range, index) => (
          <RamadanRangeRow key={index} address={{ weekday, index }} range={range} props={props} />
        ))}
      </ul>
      {hasError ? (
        <p id={errorId} role="alert">
          {translate("errorRamadanDay")}
        </p>
      ) : null}
      <button
        id={`ramadan-${String(weekday)}-add`}
        className="menu-item-secondary"
        type="button"
        disabled={!canAddRamadanRange(props.draft, weekday)}
        onClick={() => {
          props.onAdd(weekday);
        }}
      >
        {translate("addRange")}
      </button>
    </fieldset>
  );
}

export function RamadanFields(props: RamadanFieldsProps) {
  const translate = useTranslations("merchantHours");
  return (
    <fieldset disabled={props.isDisabled} className="hours-week">
      <legend>{translate("ramadanLegend")}</legend>
      {weekdayKeys.map((key, weekday) => (
        <RamadanDay key={key} weekday={weekday} props={props} />
      ))}
      <RamadanSettings
        draft={props.draft}
        errors={props.errors}
        onEdit={props.onEdit}
        onSuhoorToggle={(isOn) => {
          props.onEdit(toggleRamadanSuhoor(props.draft, isOn));
        }}
      />
    </fieldset>
  );
}
