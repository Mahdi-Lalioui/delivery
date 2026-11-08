"use client";

import { useFormatter, useTranslations } from "next-intl";
import { groupSlotsByDay, type Slot } from "./scheduling";

export type SlotChoice = { kind: "asap" } | Slot;

function isChosen(choice: SlotChoice, slot: SlotChoice): boolean {
  if (choice.kind === "asap" || slot.kind === "asap") return choice.kind === slot.kind;
  return choice.kind === slot.kind && choice.scheduledFor === slot.scheduledFor;
}

/** CUS-13: ASAP, the Iftar quick slot in Ramadan, or a 15-min slot up to 3 days ahead. */
export function SlotPicker(props: {
  slots: readonly Slot[];
  value: SlotChoice;
  onChange: (choice: SlotChoice) => void;
}) {
  const translate = useTranslations("retentionScheduling");
  const format = useFormatter();
  const { iftar, days } = groupSlotsByDay(props.slots);
  const option = (choice: SlotChoice, label: string) => (
    <label className="slot-option">
      <input
        type="radio"
        name="slot"
        checked={isChosen(props.value, choice)}
        onChange={() => {
          props.onChange(choice);
        }}
      />
      <span>{label}</span>
    </label>
  );
  const time = (slot: Slot) =>
    format.dateTime(new Date(slot.scheduledFor), {
      timeStyle: "short",
      timeZone: "Africa/Algiers",
    });
  return (
    <fieldset className="slot-picker">
      <legend>{translate("when")}</legend>
      {option({ kind: "asap" }, translate("asap"))}
      {iftar !== undefined && option(iftar, translate("iftarSlot", { time: time(iftar) }))}
      {days.map((day) => (
        <fieldset key={day.date} className="slot-day">
          <legend>
            {format.dateTime(new Date(`${day.date}T12:00:00Z`), {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "Africa/Algiers",
            })}
          </legend>
          <div className="slot-grid">
            {day.slots.map((slot) => (
              <span key={slot.scheduledFor}>{option(slot, time(slot))}</span>
            ))}
          </div>
        </fieldset>
      ))}
      {days.length === 0 && <p>{translate("noSlots")}</p>}
    </fieldset>
  );
}
