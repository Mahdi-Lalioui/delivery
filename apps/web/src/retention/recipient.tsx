"use client";

import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { useTranslations } from "next-intl";

// CUS-15: order for someone else. The recipient gets the delivery code by SMS, and a tracking
// link only if the sender opts in. Lane A's checkout sends `recipient` with the order.

export type RecipientDraft = { name: string; phone: string; shareTracking: boolean };
export type Recipient = { name: string; phoneE164: string; shareTracking: boolean };
type Field = "name" | "phone";

const maximumNameLength = 80;

export function validateRecipient(
  draft: RecipientDraft,
): { kind: "ready"; recipient: Recipient } | { kind: "invalid"; field: Field } {
  const name = draft.name.trim();
  if (name === "" || name.length > maximumNameLength) return { kind: "invalid", field: "name" };
  const phoneE164 = normalizeAlgerianPhone(draft.phone);
  if (phoneE164 === undefined) return { kind: "invalid", field: "phone" };
  return { kind: "ready", recipient: { name, phoneE164, shareTracking: draft.shareTracking } };
}

export function RecipientFields(props: {
  value: RecipientDraft;
  invalidField: Field | undefined;
  onChange: (value: RecipientDraft) => void;
}) {
  const translate = useTranslations("retentionRecipient");
  const { value } = props;
  return (
    <fieldset className="admin-merchant-form">
      <legend>{translate("title")}</legend>
      <label className="admin-merchant-field">
        <span>{translate("name")}</span>
        <input
          value={value.name}
          maxLength={maximumNameLength}
          autoComplete="off"
          aria-invalid={props.invalidField === "name" || undefined}
          onChange={(event) => {
            props.onChange({ ...value, name: event.currentTarget.value });
          }}
        />
      </label>
      <label className="admin-merchant-field">
        <span>{translate("phone")}</span>
        <input
          type="tel"
          dir="ltr"
          value={value.phone}
          autoComplete="tel"
          inputMode="tel"
          aria-invalid={props.invalidField === "phone" || undefined}
          onChange={(event) => {
            props.onChange({ ...value, phone: event.currentTarget.value });
          }}
        />
      </label>
      {props.invalidField !== undefined && (
        <p className="admin-merchant-error" role="alert">
          {translate(props.invalidField === "name" ? "nameError" : "phoneError")}
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={value.shareTracking}
          onChange={(event) => {
            props.onChange({ ...value, shareTracking: event.currentTarget.checked });
          }}
        />{" "}
        {translate("shareTracking")}
      </label>
      <p>{translate("smsNotice")}</p>
    </fieldset>
  );
}
