"use client";

import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { useEffect, useState } from "react";
import { readIdentifiers, type IdentifierRead } from "../auth/identifier-http";

export function useCheckoutContact(active: boolean) {
  const [profile, setProfile] = useState<IdentifierRead>();
  const [value, setValue] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void readIdentifiers(controller.signal).then((result) => {
      if (!controller.signal.aborted) setProfile(result);
    });
    return () => {
      controller.abort();
    };
  }, [active, revision]);
  const required = profile?.kind === "ready" && profile.value.phone === null;
  const phone = required ? normalizeAlgerianPhone(value) : undefined;
  return {
    kind: profile?.kind ?? "loading",
    required,
    phone,
    value,
    setValue,
    retry: () => {
      setProfile(undefined);
      setRevision((current) => current + 1);
    },
  };
}

export type CheckoutContact = ReturnType<typeof useCheckoutContact>;
