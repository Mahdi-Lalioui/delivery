"use client";

import { formatAlgerianPhone } from "@zaafran/i18n/phone";
import { useFormatter, useTranslations } from "next-intl";
import type { StaffState } from "../staff-flow";
import type { MerchantStaffControls } from "../use-merchant-staff";

type ReadyStaff = Extract<StaffState, { kind: "ready" }>;

const roleKeys = { owner: "roleOwner", manager: "roleManager", staff: "roleStaff" } as const;

function Phone({ phoneE164 }: { phoneE164: string }) {
  return <bdi dir="ltr">{formatAlgerianPhone(phoneE164) ?? phoneE164}</bdi>;
}

function StaffMembers({ state }: { state: ReadyStaff }) {
  const translate = useTranslations("merchantStaff");
  return (
    <section className="hours-card" aria-labelledby="staff-members-title">
      <h2 id="staff-members-title">{translate("members")}</h2>
      <ul className="hours-ranges">
        {state.list.members.map((member) => (
          <li key={member.userId} className="hours-pause-actions">
            <Phone phoneE164={member.phoneE164} />
            <span className="hours-badge">{translate(roleKeys[member.role])}</span>
            {member.isSelf && <span>{translate("you")}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StaffInvitations({
  state,
  controls,
}: {
  state: ReadyStaff;
  controls: MerchantStaffControls;
}) {
  const translate = useTranslations("merchantStaff");
  const format = useFormatter();
  const { invitations } = state.list;
  return (
    <section className="hours-card" aria-labelledby="staff-invitations-title">
      <h2 id="staff-invitations-title">{translate("invitations")}</h2>
      {invitations.length === 0 && <p>{translate("noInvitations")}</p>}
      <ul className="hours-ranges">
        {invitations.map((invitation) => {
          const phone = formatAlgerianPhone(invitation.phoneE164) ?? invitation.phoneE164;
          const isRevoking =
            typeof state.pending === "object" &&
            state.pending.invitationId === invitation.invitationId;
          return (
            <li key={invitation.invitationId} className="hours-pause-actions">
              <Phone phoneE164={invitation.phoneE164} />
              <span className="hours-badge">{translate(roleKeys[invitation.role])}</span>
              <span>
                {translate("expires")}{" "}
                {format.dateTime(new Date(invitation.expiresAt), { dateStyle: "medium" })}
              </span>
              <button
                className="menu-item-secondary"
                type="button"
                aria-label={translate("revoke", { phone })}
                disabled={state.pending !== undefined}
                onClick={() => {
                  controls.revoke(invitation.invitationId);
                }}
              >
                {isRevoking ? translate("revoking") : translate("revoke", { phone })}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StaffLists({
  state,
  controls,
}: {
  state: ReadyStaff;
  controls: MerchantStaffControls;
}) {
  return (
    <>
      <StaffMembers state={state} />
      <StaffInvitations state={state} controls={controls} />
    </>
  );
}
