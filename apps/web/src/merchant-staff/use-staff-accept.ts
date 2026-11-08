"use client";

import { useEffect, useRef, useState } from "react";
import { pendingInvitationKey, readInvitationToken } from "./staff-accept";
import { acceptStaffInvitation } from "./staff-http";

type AcceptResult = ReturnType<typeof acceptStaffInvitation>;

export type StaffAcceptView =
  | { kind: "accepting" | "missing" | "sign-in" | "not-found" | "already-member" | "error" }
  | { kind: "accepted"; restaurantName: string; role: "manager" | "staff" };

function readStoredToken(): string | undefined {
  try {
    return readInvitationToken(`token=${sessionStorage.getItem(pendingInvitationKey) ?? ""}`);
  } catch {
    return undefined;
  }
}

function storeToken(token: string | undefined) {
  try {
    if (token) sessionStorage.setItem(pendingInvitationKey, token);
    else sessionStorage.removeItem(pendingInvitationKey);
  } catch {
    // Storage may be blocked; the invitee can then reopen the SMS link after signing in.
  }
}

/** Takes the token from the link fragment (clearing it) or from before a sign-in. */
function takeToken(): string | undefined {
  const fromLink = readInvitationToken(window.location.hash);
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return fromLink ?? readStoredToken();
}

/** MER-23: redeems the invitation once for the signed-in invitee. */
export function useStaffAccept(): { view: StaffAcceptView; retry: () => void } {
  const [view, setView] = useState<StaffAcceptView>({ kind: "accepting" });
  const [attempt, setAttempt] = useState(0);
  const token = useRef<string | undefined>(undefined);
  // The token is single-use, so a re-run effect awaits the same request instead of sending again.
  const request = useRef<{ attempt: number; result: AcceptResult } | undefined>(undefined);

  useEffect(() => {
    token.current ??= takeToken();
    const current = token.current;
    if (!current) {
      setView({ kind: "missing" });
      return;
    }
    if (request.current?.attempt !== attempt) {
      request.current = { attempt, result: acceptStaffInvitation(current) };
    }
    let isCurrent = true;
    void request.current.result.then((result) => {
      if (!isCurrent) return;
      // Keep the token only where the same request can still succeed.
      storeToken(result.kind === "sign-in" ? current : undefined);
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
