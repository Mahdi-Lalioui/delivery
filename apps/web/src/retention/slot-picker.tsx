"use client";

import { Icon } from "@zaafran/ui";
import { formatAlgiersTime } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { groupSlotsByDay, type Slot } from "./scheduling";

function appLocale(tag: string): Locale {
  if (tag.startsWith("ar")) return "ar";
  return tag.startsWith("en") ? "en" : "fr";
}

export type SlotChoice = { kind: "asap" } | Slot;

function isChosen(choice: SlotChoice, slot: SlotChoice): boolean {
  if (choice.kind === "asap" || slot.kind === "asap") return choice.kind === slot.kind;
  return choice.kind === slot.kind && choice.scheduledFor === slot.scheduledFor;
}

type OptionProps = {
  choice: SlotChoice;
  value: SlotChoice;
  onChange: (choice: SlotChoice) => void;
};

/** A large card option (ASAP and the Iftar quick slot). */
function CardOption(
  props: OptionProps & {
    icon: "clock" | "moon";
    title: string;
    detail?: string;
    tone: "default" | "iftar";
  },
) {
  return (
    <label className="slot-card" data-tone={props.tone}>
      <input
        type="radio"
        name="slot"
        className="ui-visually-hidden"
        checked={isChosen(props.value, props.choice)}
        onChange={() => {
          props.onChange(props.choice);
        }}
      />
      <span className="slot-card-face">
        <Icon name={props.icon} size={22} />
        <span className="slot-card-text">
          <span className="slot-card-title">{props.title}</span>
          {props.detail !== undefined && <span className="slot-card-detail">{props.detail}</span>}
        </span>
      </span>
    </label>
  );
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
  const locale = appLocale(useLocale());
  // 24-hour Algiers time with Latin digits, as everywhere else in the product.
  const time = (slot: Slot) => formatAlgiersTime(new Date(slot.scheduledFor), locale);
  const dayLabel = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Africa/Algiers",
    });
  return (
    <fieldset className="slot-picker">
      <legend className="ui-field-label">{translate("when")}</legend>
      <div className="slot-cards">
        <CardOption
          choice={{ kind: "asap" }}
          value={props.value}
          onChange={props.onChange}
          icon="clock"
          title={translate("asap")}
          tone="default"
        />
        {iftar !== undefined && (
          <CardOption
            choice={iftar}
            value={props.value}
            onChange={props.onChange}
            icon="moon"
            title={translate("iftarTitle")}
            detail={translate("iftarSlot", { time: time(iftar) })}
            tone="iftar"
          />
        )}
      </div>
      {days.map((day) => (
        <fieldset key={day.date} className="slot-day">
          <legend className="slot-day-label">{dayLabel(day.date)}</legend>
          <div className="ui-chips">
            {day.slots.map((slot) => (
              <label key={slot.scheduledFor} className="ui-chip">
                <input
                  type="radio"
                  name="slot"
                  checked={isChosen(props.value, slot)}
                  onChange={() => {
                    props.onChange(slot);
                  }}
                />
                <span className="ui-chip-face" dir="ltr">
                  {time(slot)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {days.length === 0 && <p className="ui-field-hint">{translate("noSlots")}</p>}
    </fieldset>
  );
}
