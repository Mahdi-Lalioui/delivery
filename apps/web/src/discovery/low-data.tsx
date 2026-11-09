"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

const LowData = createContext(false);

function connection() {
  const current = "connection" in navigator ? navigator.connection : undefined;
  return current instanceof EventTarget ? current : undefined;
}

function subscribe(update: () => void) {
  const current = connection();
  current?.addEventListener("change", update);
  return () => {
    current?.removeEventListener("change", update);
  };
}

function readPreference() {
  const current = connection();
  return current !== undefined && "saveData" in current && current.saveData === true;
}

const serverPreference = () => false;

export function LowDataProvider({
  requested,
  children,
}: {
  requested: boolean;
  children: ReactNode;
}) {
  const browserPreference = useSyncExternalStore(subscribe, readPreference, serverPreference);
  return <LowData value={requested || browserPreference}>{children}</LowData>;
}

export function useLowData() {
  return useContext(LowData);
}
