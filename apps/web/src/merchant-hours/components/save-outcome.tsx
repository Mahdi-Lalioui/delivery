import { useTranslations } from "next-intl";
import type { HoursState } from "../hours-flow";

type SaveFailure = NonNullable<Extract<HoursState, { kind: "editing" }>["failure"]>;

/** The outcome fields shared by the weekly hours and Ramadan save states. */
export type SaveOutcomeState =
  | { readonly kind: "saving" }
  | { readonly kind: "editing"; readonly failure?: SaveFailure; readonly notice?: "saved" };

export const reloadMessages = {
  "session-changed": "sessionChanged",
  "revision-conflict": "revisionConflict",
} as const;
const failureMessages = {
  "rate-limited": "rateLimited",
  "invalid-hours": "invalidHours",
  "pause-in-past": "invalidHours",
  "sign-in": "signInRequired",
  forbidden: "forbidden",
  error: "saveError",
} as const;

export function ReloadHours({ message, reload }: { message: string; reload: () => void }) {
  const translate = useTranslations("merchantHours");
  return (
    <div className="hours-card">
      <p className="hours-error" role="alert">
        {message}
      </p>
      <button className="menu-item-secondary" type="button" data-hours-reload onClick={reload}>
        {translate("reload")}
      </button>
    </div>
  );
}

export function SaveOutcome({ state, reload }: { state: SaveOutcomeState; reload: () => void }) {
  const translate = useTranslations("merchantHours");
  if (state.kind === "saving") return <p role="status">{translate("saving")}</p>;
  const { failure, notice } = state;
  if (failure === "revision-conflict" || failure === "session-changed") {
    return <ReloadHours message={translate(reloadMessages[failure])} reload={reload} />;
  }
  if (failure) {
    return (
      <p className="hours-error" role="alert">
        {translate(failureMessages[failure])}
      </p>
    );
  }
  return (
    <p className="hours-announcement" role="status">
      {notice === "saved" ? translate("saved") : null}
    </p>
  );
}
