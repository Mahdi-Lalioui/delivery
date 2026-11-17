"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearInvitationFragment,
  readPendingInvitation,
  stageInvitation,
} from "../auth/invitation-continuations";
import { readInvitationToken } from "./staff-accept";
import { acceptStaffInvitation } from "./staff-http";

type AcceptResult = ReturnType<typeof acceptStaffInvitation>;

export type StaffAcceptView =
  | { kind: "accepting" | "missing" | "sign-in" | "not-found" | "already-member" | "error" }
  | { kind: "accepted"; restaurantName: string; role: "manager" | "staff" };

async function acceptFromLinkOrCookie(): AcceptResult {
  const fragment = window.location.hash;
  const token = readInvitationToken(fragment);
  try {
    const available = token
      ? await stageInvitation("staff", token)
      : await readPendingInvitation("staff");
    if (token && !available) return { kind: "error" };
    clearInvitationFragment(fragment);
    return available ? await acceptStaffInvitation(token) : { kind: "missing" };
  } catch {
    return { kind: "error" };
  }
}

/** MER-23: redeems the invitation once for the signed-in invitee. */
export function useStaffAccept(): { view: StaffAcceptView; retry: () => void } {
  const [view, setView] = useState<StaffAcceptView>({ kind: "accepting" });
  const [attempt, setAttempt] = useState(0);
  // The token is single-use, so a re-run effect awaits the same request instead of sending again.
  const request = useRef<{ attempt: number; result: AcceptResult } | undefined>(undefined);

  useEffect(() => {
    if (request.current?.attempt !== attempt) {
      request.current = { attempt, result: acceptFromLinkOrCookie() };
    }
    let isCurrent = true;
    void request.current.result.then((result) => {
      if (!isCurrent) return;
      if (result.kind === "accepted") {
        const { restaurantName, role } = result.accepted;
        setView({ kind: "accepted", restaurantName, role });
      } else {
        setView({ kind: result.kind });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  function retry() {
    setView({ kind: "accepting" });
    setAttempt((current) => current + 1);
  }

  return { view, retry };
}
