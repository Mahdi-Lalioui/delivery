"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { MerchantStaffControls } from "../use-merchant-staff";

const roles = [
  { role: "manager", label: "roleManager", hint: "inviteRoleManagerHint" },
  { role: "staff", label: "roleStaff", hint: "inviteRoleStaffHint" },
] as const;

function readRole(value: FormDataEntryValue | null): "manager" | "staff" | "" {
  return value === "manager" || value === "staff" ? value : "";
}

/** MER-23: the owner invites one phone number to the manager or staff role. */
export function StaffInviteForm({ controls }: { controls: MerchantStaffControls }) {
  const translate = useTranslations("merchantStaff");
  const form = useRef<HTMLFormElement>(null);
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
          role: readRole(data.get("role")),
        });
      }}
    >
      <h2 id="staff-invite-title">{translate("inviteTitle")}</h2>
      <div className="menu-item-field">
        <label htmlFor="staff-invite-phone">{translate("invitePhone")}</label>
        <input
          id="staff-invite-phone"
          name="phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="off"
          disabled={isBusy}
          aria-invalid={isPhoneInvalid}
          aria-describedby={
            isPhoneInvalid
              ? "staff-invite-phone-hint staff-invite-phone-error"
              : "staff-invite-phone-hint"
          }
        />
        <p id="staff-invite-phone-hint">{translate("invitePhoneHint")}</p>
        {isPhoneInvalid && (
          <p id="staff-invite-phone-error" className="hours-error">
            {translate("phoneError")}
          </p>
        )}
      </div>
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
