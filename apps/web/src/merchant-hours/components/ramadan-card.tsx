import { useTranslations } from "next-intl";
import type { MerchantHoursEditor } from "../use-hours-editor";
import { RamadanFields } from "./ramadan-fields";
import { SaveOutcome } from "./save-outcome";

export function RamadanCard({
  controls,
  isDisabled,
}: {
  controls: MerchantHoursEditor;
  /** True while another command on the shared D-011 revision is in flight. */
  isDisabled: boolean;
}) {
  const translate = useTranslations("merchantHours");
  const { ramadan } = controls;
  const { state } = ramadan;
  if (state.kind === "loading") {
    return (
      <div className="hours-card">
        <p role="status">{translate("ramadanLoading")}</p>
      </div>
    );
  }
  if (state.kind === "load-failed") {
    return (
      <div className="hours-card">
        <p className="hours-error">{translate("ramadanUnavailable")}</p>
      </div>
    );
  }
  const isSaving = isDisabled || state.kind === "saving";
  return (
    <form
      className="hours-card"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void ramadan.save();
      }}
    >
      <RamadanFields
        draft={state.draft}
        errors={state.errors}
        isDisabled={isSaving}
        onEdit={ramadan.edit}
        onAdd={ramadan.add}
        onRemove={ramadan.remove}
      />
      <SaveOutcome state={state} reload={controls.reload} />
      <button className="menu-item-primary" type="submit" data-ramadan-save disabled={isSaving}>
        {translate("saveRamadan")}
      </button>
    </form>
  );
}
