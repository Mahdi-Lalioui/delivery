import { formatAlgiersTime } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { PauseState } from "../hours-pause";

type ReadyPause = Extract<PauseState, { kind: "ready" | "saving" }>;
type PauseFailure = NonNullable<Extract<PauseState, { kind: "ready" }>["failure"]>;

export interface HoursPauseControlProps {
  readonly state: PauseState;
  /** Computed by the hook from its clock, so rendering stays pure. */
  readonly isPaused: boolean;
  readonly isDisabled: boolean;
  readonly locale: Locale;
  readonly onClose: (minutes: number) => void;
  readonly onReopen: () => void;
  readonly onRetry: () => void;
  readonly onReload: () => void;
}

const durations = [
  { minutes: 30, label: "pauseFor30" },
  { minutes: 60, label: "pauseFor60" },
  { minutes: 120, label: "pauseFor120" },
] as const;
const failureMessages = {
  "pause-in-past": "pauseInPast",
  "invalid-hours": "saveError",
  "rate-limited": "rateLimited",
  "sign-in": "signInRequired",
  forbidden: "forbidden",
  error: "saveError",
  "revision-conflict": "revisionConflict",
  "session-changed": "sessionChanged",
} as const satisfies Record<PauseFailure, string>;

function PauseOutcome({
  state,
  onRetry,
  onReload,
}: {
  state: ReadyPause;
  onRetry: () => void;
  onReload: () => void;
}) {
  const translate = useTranslations("merchantHours");
  if (state.kind === "saving") return <p role="status">{translate("saving")}</p>;
  const { failure } = state;
  if (!failure) {
    return (
      <p className="hours-announcement" role="status">
        {state.notice === "saved" ? translate("pauseSaved") : null}
      </p>
    );
  }
  const isStale = failure === "revision-conflict" || failure === "session-changed";
  return (
    <div className="hours-pause-outcome">
      <p className="hours-error" role="alert">
        {translate(failureMessages[failure])}
      </p>
      {state.retry ? (
        <button className="menu-item-secondary" type="button" data-pause-retry onClick={onRetry}>
          {translate("pauseRetry")}
        </button>
      ) : null}
      {isStale ? (
        <button className="menu-item-secondary" type="button" data-hours-reload onClick={onReload}>
          {translate("reload")}
        </button>
      ) : null}
    </div>
  );
}

function PauseActions({ props, state }: { props: HoursPauseControlProps; state: ReadyPause }) {
  const translate = useTranslations("merchantHours");
  if (props.isPaused && state.pausedUntil !== null) {
    const time = formatAlgiersTime(Date.parse(state.pausedUntil), props.locale);
    return (
      <div className="hours-pause-actions">
        <p className="hours-badge">{translate("pausedUntil", { time })}</p>
        <button
          className="menu-item-primary"
          type="button"
          data-pause-reopen
          onClick={props.onReopen}
        >
          {translate("reopen")}
        </button>
      </div>
    );
  }
  return (
    <div className="hours-pause-actions">
      {durations.map(({ minutes, label }) => (
        <button
          key={minutes}
          className="menu-item-secondary"
          type="button"
          data-pause-close={minutes}
          onClick={() => {
            props.onClose(minutes);
          }}
        >
          {translate(label)}
        </button>
      ))}
    </div>
  );
}

export function HoursPauseControl(props: HoursPauseControlProps) {
  const translate = useTranslations("merchantHours");
  const { state } = props;
  if (state.kind === "loading") return <p role="status">{translate("pauseLoading")}</p>;
  if (state.kind === "unavailable")
    return <p className="hours-error">{translate("pauseUnavailable")}</p>;
  return (
    <fieldset disabled={props.isDisabled || state.kind === "saving"} className="hours-pause">
      <legend>{translate("pauseTitle")}</legend>
      <p className="hours-closed">{translate("pauseDescription")}</p>
      <PauseActions props={props} state={state} />
      <PauseOutcome state={state} onRetry={props.onRetry} onReload={props.onReload} />
    </fieldset>
  );
}
