"use client";

import { useEffect, useRef, useState } from "react";
import {
  listDevices,
  revokeDevice,
  signOutDevices,
  type DeviceList,
  type DeviceSession,
  type LogoutAttempt,
  type LogoutScope,
} from "./device-sessions-http";

type SessionView = DeviceList | { kind: "loading" } | { kind: "signed-out" };
type SessionStatus = "revoked" | "action-error";
type Mutation = { kind: "revoke"; id: string } | { kind: "sign-out"; scope: LogoutScope };

export function prepareLogoutAttempt({
  sessions,
  scope,
  previous,
}: {
  sessions: readonly DeviceSession[];
  scope: LogoutScope;
  previous?: LogoutAttempt | undefined;
}): LogoutAttempt | undefined {
  const current = sessions.find((device) => device.current);
  if (!current) return undefined;
  if (previous?.scope === scope && previous.expectedSessionId === current.id) return previous;

  return { scope, expectedSessionId: current.id, idempotencyKey: crypto.randomUUID() };
}

export function useDeviceSessions() {
  const [view, setView] = useState<SessionView>({ kind: "loading" });
  const [status, setStatus] = useState<SessionStatus>();
  const [pending, setPending] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const inFlight = useRef(false);
  const logoutAttempt = useRef<LogoutAttempt | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void listDevices(controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [loadVersion]);

  function retry() {
    setView({ kind: "loading" });
    setLoadVersion((version) => version + 1);
  }

  function signOut(scope: LogoutScope) {
    return runMutation({ kind: "sign-out", scope });
  }

  function revoke(id: string) {
    return runMutation({ kind: "revoke", id });
  }

  async function execute(command: Mutation, sessions: readonly DeviceSession[]) {
    if (command.kind === "revoke") {
      return sessions.some((device) => device.current)
        ? revokeDevice(command.id)
        : "session-changed";
    }

    const attempt = prepareLogoutAttempt({
      sessions,
      scope: command.scope,
      previous: logoutAttempt.current,
    });
    logoutAttempt.current = attempt;
    if (!attempt) return "session-changed";
    const result = await signOutDevices(attempt);
    if (result !== "error") logoutAttempt.current = undefined;
    return result;
  }

  async function runMutation(command: Mutation) {
    if (view.kind !== "ready" || inFlight.current) return;
    if (
      command.kind === "revoke" &&
      !view.sessions.some(({ id, current }) => id === command.id && !current)
    )
      return;

    inFlight.current = true;
    setPending(true);
    setStatus(undefined);
    const result = await execute(command, view.sessions);
    inFlight.current = false;
    setPending(false);

    if (result === "error") {
      setStatus("action-error");
      return;
    }
    if (result === "unauthenticated") {
      setView({ kind: "unauthenticated" });
      return;
    }
    if (result === "session-changed") {
      logoutAttempt.current = undefined;
      setView({ kind: "load-error" });
      return;
    }
    if (command.kind === "sign-out") {
      setView({ kind: "signed-out" });
      return;
    }

    setView({ kind: "ready", sessions: view.sessions.filter(({ id }) => id !== command.id) });
    setStatus("revoked");
  }

  return { view, status, pending, retry, revoke, signOut };
}

export type DeviceSessions = ReturnType<typeof useDeviceSessions>;
