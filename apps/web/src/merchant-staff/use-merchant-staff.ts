"use client";

import type { PublicLocale } from "@zaafran/i18n/locales";

import { useEffect, useReducer, useRef, useState } from "react";
import { initialStaffState, reduceStaff, staffRevokeKey, type StaffState } from "./staff-flow";
import type { StaffRevokeAttempt } from "./staff-flow";
import {
  listStaff,
  prepareStaffInvitation,
  revokeStaffInvitation,
  sendStaffInvitation,
  type StaffInvitationAttempt,
} from "./staff-http";

type InviteDraft = {
  phone: string;
  method?: "phone" | "email";
  locale?: PublicLocale | undefined;
  role: "manager" | "staff" | "";
};

export interface MerchantStaffControls {
  readonly state: StaffState;
  readonly invalidField: "phone" | "role" | undefined;
  readonly invite: (draft: InviteDraft) => void;
  readonly revoke: (invitationId: string) => void;
  readonly reload: () => void;
}

/** MER-23: reads the owner's team and sends one invite or revoke at a time. */
export function useMerchantStaff(merchantId: string): MerchantStaffControls {
  const [state, dispatch] = useReducer(reduceStaff, initialStaffState);
  const [version, setVersion] = useState(0);
  const [invalidField, setInvalidField] = useState<"phone" | "role">();
  const inFlight = useRef(false);
  // Kept only after an uncertain failure, so the retry replays the same command.
  const inviteAttempt = useRef<StaffInvitationAttempt | undefined>(undefined);
  const revokeAttempt = useRef<StaffRevokeAttempt | undefined>(undefined);

  useEffect(() => {
    let isCurrent = true;
    void listStaff({ merchantId }).then((result) => {
      if (isCurrent) dispatch({ kind: "loaded", result });
    });
    return () => {
      isCurrent = false;
    };
  }, [merchantId, version]);

  async function invite(draft: InviteDraft) {
    if (inFlight.current || state.kind !== "ready" || state.pending) return;
    const prepared = prepareStaffInvitation({
      merchantId,
      expectedSessionId: state.list.sessionId,
      ...draft,
      previous: inviteAttempt.current,
    });
    if (prepared.kind === "invalid") {
      setInvalidField(prepared.field);
      return;
    }
    setInvalidField(undefined);
    inFlight.current = true;
    inviteAttempt.current = prepared.attempt;
    dispatch({ kind: "invite-started" });
    const result = await sendStaffInvitation(prepared.attempt);
    inFlight.current = false;
    if (result.kind !== "error") inviteAttempt.current = undefined;
    dispatch({ kind: "invite-finished", result });
    if (result.kind === "invited") setVersion((current) => current + 1);
  }

  async function revoke(invitationId: string) {
    if (inFlight.current || state.kind !== "ready" || state.pending) return;
    const target = { invitationId, sessionId: state.list.sessionId };
    const attempt = staffRevokeKey(revokeAttempt.current, target, () => crypto.randomUUID());
    inFlight.current = true;
    revokeAttempt.current = attempt;
    dispatch({ kind: "revoke-started", invitationId });
    const result = await revokeStaffInvitation({
      merchantId,
      invitationId,
      expectedSessionId: attempt.sessionId,
      key: attempt.key,
    });
    inFlight.current = false;
    if (result.kind !== "error") revokeAttempt.current = undefined;
    dispatch({ kind: "revoke-finished", invitationId, result });
  }

  function reload() {
    if (inFlight.current) return;
    inviteAttempt.current = undefined;
    revokeAttempt.current = undefined;
    setInvalidField(undefined);
    dispatch({ kind: "reload" });
    setVersion((current) => current + 1);
  }

  return {
    state,
    invalidField,
    invite: (draft) => void invite(draft),
    revoke: (invitationId) => void revoke(invitationId),
    reload,
  };
}
