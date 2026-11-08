"use client";

import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { Card, FormGrid, TextField, Toggle } from "@zaafran/ui";
import { useTranslations } from "next-intl";

// CUS-15: order for someone else. The recipient gets the delivery code by SMS, and a tracking
// link only if the sender opts in. Lane A's checkout sends `recipient` with the order.

export type RecipientDraft = { name: string; phone: string; shareTracking: boolean };
export type Recipient = { name: string; phoneE164: string; shareTracking: boolean };
type Field = "name" | "phone";

const maximumNameLength = 80;
const phonePrefix = "+213";

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
    <Card title={translate("title")} titleId="recipient-title">
      <FormGrid>
        <TextField
          label={translate("name")}
          value={value.name}
          maxLength={maximumNameLength}
          autoComplete="off"
          error={props.invalidField === "name" ? translate("nameError") : undefined}
          onChange={(event) => {
            props.onChange({ ...value, name: event.currentTarget.value });
          }}
        />
        <TextField
          label={translate("phone")}
          type="tel"
          dir="ltr"
          prefix={phonePrefix}
          value={value.phone}
          autoComplete="tel"
          inputMode="tel"
          error={props.invalidField === "phone" ? translate("phoneError") : undefined}
          onChange={(event) => {
            props.onChange({ ...value, phone: event.currentTarget.value });
          }}
        />
      </FormGrid>
      <Toggle
        label={translate("shareTracking")}
        description={translate("smsNotice")}
        checked={value.shareTracking}
        onChange={(checked) => {
          props.onChange({ ...value, shareTracking: checked });
        }}
      />
    </Card>
  );
}
