"use client";

import { useRef, useState } from "react";
import {
  parseMerchantDraft,
  prepareMerchantAttempt,
  type DraftField,
  type MerchantDraft,
} from "./merchant-application";
import { submitMerchantApplication } from "./merchant-http";

const emptyDraft: MerchantDraft = {
  restaurantName: "",
  ownerName: "",
  communeId: "",
  latitude: "",
  longitude: "",
  cuisines: [],
  rcNumber: "",
};

type ApplicationFailure = Extract<
  Awaited<ReturnType<typeof submitMerchantApplication>>,
  { kind: "error" }
>;

export function useMerchantApplication(expectedSessionId: string) {
  const [draft, setDraft] = useState(emptyDraft);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [error, setError] = useState<ApplicationFailure["error"]>();
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<ReturnType<typeof prepareMerchantAttempt> | undefined>(undefined);

  function update(changes: Partial<MerchantDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setFields((invalid) => invalid.filter((field) => !Object.hasOwn(changes, field)));
    setError(undefined);
  }

  async function submit(): Promise<DraftField | undefined> {
    if (inFlight.current || sessionChanged) return undefined;
    const parsed = parseMerchantDraft(draft);
    if (parsed.kind === "invalid") {
      setError(undefined);
      setFields(parsed.fields);
      return parsed.fields[0];
    }

    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setFields([]);
    attempt.current = prepareMerchantAttempt(parsed.data, attempt.current);
    const result = await submitMerchantApplication({ ...attempt.current, expectedSessionId });
    inFlight.current = false;
    setPending(false);

    if (result.kind === "created") {
      attempt.current = undefined;
      setSubmitted(true);
      return undefined;
    }
    if (result.kind === "session-changed") {
      attempt.current = undefined;
      setDraft(emptyDraft);
      setSessionChanged(true);
      return undefined;
    }
    if (!result.shouldReuseKey) attempt.current = undefined;
    setError(result.error);
    if (result.error === "outsideCommune") return "latitude";
    return result.error === "invalidCommune" ? "communeId" : undefined;
  }

  return { draft, fields, error, pending, submitted, sessionChanged, update, submit };
}

export type MerchantApplicationState = ReturnType<typeof useMerchantApplication>;
