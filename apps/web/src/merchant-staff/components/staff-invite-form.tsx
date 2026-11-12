"use client";

import { isPublicLocale } from "@zaafran/i18n/locales";
import { SegmentedControl } from "@zaafran/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { MerchantStaffControls } from "../use-merchant-staff";

const roles = [
  { role: "manager", label: "roleManager", hint: "inviteRoleManagerHint" },
  { role: "staff", label: "roleStaff", hint: "inviteRoleStaffHint" },
] as const;

function readRole(value: FormDataEntryValue | null): "manager" | "staff" | "" {
  return value === "manager" || value === "staff" ? value : "";
}

/** MER-23: the owner invites a verified phone or email to the manager or staff role. */
export function StaffInviteForm({ controls }: { controls: MerchantStaffControls }) {
  const translate = useTranslations("merchantStaff");
  const form = useRef<HTMLFormElement>(null);
  const [locale] = useLocale().split("-");
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const { state, invalidField } = controls;
  const isBusy = state.kind === "ready" && state.pending !== undefined;
  const notice = state.kind === "ready" ? state.notice : undefined;

  useEffect(() => {
    if (notice === "invited") form.current?.reset();
  }, [notice]);

  useEffect(() => {
    if (invalidField) form.current?.querySelector<HTMLElement>(`[name="${invalidField}"]`)?.focus();
  }, [invalidField]);

  const isPhoneInvalid = invalidField === "phone";
  const isRoleInvalid = invalidField === "role";
  return (
    <form
      ref={form}
      className="hours-card"
      noValidate
      aria-labelledby="staff-invite-title"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const phone = data.get("phone");
        controls.invite({
          phone: typeof phone === "string" ? phone : "",
          method,
          locale: isPublicLocale(locale) ? locale : undefined,
          role: readRole(data.get("role")),
        });
      }}
    >
      <h2 id="staff-invite-title">{translate("inviteTitle")}</h2>
      <SegmentedControl
        legend={translate("inviteMethod")}
        name="staff-invite-method"
        value={method}
        onChange={setMethod}
        disabled={isBusy}
        options={[
          { value: "phone", label: translate("inviteSmsMethod") },
          { value: "email", label: translate("inviteEmailMethod") },
        ]}
      />
      <InvitationDestination method={method} busy={isBusy} invalid={isPhoneInvalid} />
      <fieldset
        className="hours-ranges"
        disabled={isBusy}
        aria-describedby={isRoleInvalid ? "staff-invite-role-error" : undefined}
      >
        <legend>{translate("inviteRole")}</legend>
        {roles.map(({ role, label, hint }) => (
          <label key={role} className="hours-check">
            <input type="radio" name="role" value={role} aria-describedby={`staff-role-${role}`} />
            <span>{translate(label)}</span>
            <span id={`staff-role-${role}`}>{translate(hint)}</span>
          </label>
        ))}
        {isRoleInvalid && (
          <p id="staff-invite-role-error" className="hours-error">
            {translate("roleError")}
          </p>
        )}
      </fieldset>
      <button className="menu-item-primary" type="submit" disabled={isBusy}>
        {translate(state.kind === "ready" && state.pending === "invite" ? "sending" : "send")}
      </button>
    </form>
  );
}

function InvitationDestination({
  method,
  busy,
  invalid,
}: {
  method: "phone" | "email";
  busy: boolean;
  invalid: boolean;
}) {
  const translate = useTranslations("merchantStaff");
  const isEmail = method === "email";
  const inputMode = isEmail ? "email" : "tel";
  return (
    <div className="menu-item-field">
      <label htmlFor="staff-invite-phone">
        {translate(isEmail ? "inviteEmail" : "invitePhone")}
      </label>
      <input
        id="staff-invite-phone"
        name="phone"
        key={method}
        type={inputMode}
        dir="ltr"
        inputMode={inputMode}
        autoComplete="off"
        disabled={busy}
        aria-invalid={invalid}
        aria-describedby={
          invalid ? "staff-invite-phone-hint staff-invite-phone-error" : "staff-invite-phone-hint"
        }
      />
      <p id="staff-invite-phone-hint">
        {translate(isEmail ? "inviteEmailHint" : "invitePhoneHint")}
      </p>
      {invalid && (
        <p id="staff-invite-phone-error" className="hours-error">
          {translate(isEmail ? "emailError" : "phoneError")}
        </p>
      )}
    </div>
  );
}
