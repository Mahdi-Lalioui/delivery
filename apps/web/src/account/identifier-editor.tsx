"use client";

import { normalizedEmail } from "@zaafran/contracts/auth";
import { isPublicLocale, type Locale } from "@zaafran/i18n/locales";
import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { Button, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  chooseVerificationAttempt,
  isTerminalCodeError,
  normalizeCode,
  secondsUntil,
} from "../auth/auth-flow";
import {
  confirmIdentifierCode,
  requestIdentifierCode,
  type AuthError,
  type SignInMethod,
  type VerifyAttempt,
} from "../auth/auth-http";
import type { VerifiedIdentifiers } from "../auth/identifier-http";

type EditorProps = {
  method: SignInMethod;
  locale: Locale;
  sessionId: string;
  onSave: (value: VerifiedIdentifiers) => void;
  onClose: () => void;
};
type ErrorCode = AuthError | "invalidEmail" | "invalidPhone" | "invalidCode";

function identifierValue(method: SignInMethod, value: string) {
  if (method === "phone") return normalizeAlgerianPhone(value);
  const parsed = normalizedEmail.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function useIdentifierEditor({ method, locale, sessionId, onSave }: Omit<EditorProps, "onClose">) {
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{
    id: string;
    destination: string;
    expiresAt: number;
    resendAt: number;
  }>();
  const [error, setError] = useState<ErrorCode>();
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const pending = useRef(false);
  const request = useRef<{ destination: string; key: string }>(undefined);
  const verification = useRef<VerifyAttempt>(undefined);
  const email = method === "email";
  const expired = challenge !== undefined && clock >= challenge.expiresAt;
  const resendSeconds = challenge ? secondsUntil(challenge.resendAt, clock) : 0;
  const displayError = expired ? "otpExpired" : error;

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [challenge]);

  async function sendCode() {
    if (pending.current || resendSeconds > 0) return;
    const destination = challenge ? challenge.destination : identifierValue(method, value);
    if (!destination) {
      setError(email ? "invalidEmail" : "invalidPhone");
      return;
    }
    if (request.current?.destination !== destination)
      request.current = { destination, key: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError(undefined);
    const body = challengeDestination(method, destination, locale);
    const result = await requestIdentifierCode(body, sessionId, request.current.key);
    pending.current = false;
    setBusy(false);
    if (!result.ok) {
      if (!result.canRetrySameRequest) request.current = undefined;
      setError(result.error);
      return;
    }
    request.current = undefined;
    verification.current = undefined;
    setCode("");
    setClock(Date.now());
    setChallenge({
      id: result.data.challengeId,
      destination,
      expiresAt: Date.parse(result.data.expiresAt),
      resendAt: Date.parse(result.data.resendAt),
    });
  }

  async function verify() {
    if (pending.current || !challenge || expired || isTerminalCodeError(error)) return;
    if (code.length !== 6) {
      setError("invalidCode");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    verification.current = chooseVerificationAttempt({
      challengeId: challenge.id,
      code,
      previous: verification.current,
    });
    const result = await confirmIdentifierCode(verification.current, sessionId);
    pending.current = false;
    setBusy(false);
    if (result.ok) onSave(result.data);
    else {
      if (!result.canRetrySameRequest) verification.current = undefined;
      setError(result.error);
    }
  }

  return {
    email,
    value,
    setValue,
    code,
    setCode,
    challenge,
    error,
    setError,
    displayError,
    busy,
    expired,
    resendSeconds,
    sendCode,
    verify,
  };
}

function challengeDestination(method: SignInMethod, value: string, locale: Locale) {
  const language = isPublicLocale(locale) ? locale : undefined;
  return method === "email"
    ? { email: value, locale: language }
    : { phone: value, locale: language };
}

type Flow = ReturnType<typeof useIdentifierEditor>;

function IdentifierInput({ flow }: { flow: Flow }) {
  const account = useTranslations("accountHub");
  const auth = useTranslations("auth");
  const { email, challenge, busy, expired, error, displayError } = flow;
  const fieldLabel = email ? "emailLabel" : "phoneLabel";
  const fieldType = email ? "email" : "tel";
  if (!challenge)
    return (
      <TextField
        label={auth(fieldLabel)}
        type={fieldType}
        autoComplete={fieldType}
        dir="ltr"
        value={flow.value}
        disabled={busy}
        error={error ? auth(error) : undefined}
        onChange={(event) => {
          flow.setValue(event.currentTarget.value);
          flow.setError(undefined);
        }}
      />
    );
  return (
    <TextField
      label={auth(email ? "emailOtpLabel" : "otpLabel")}
      hint={account("contactSent", { destination: `\u2066${challenge.destination}\u2069` })}
      error={displayError ? auth(displayError) : undefined}
      dir="ltr"
      inputMode="numeric"
      autoComplete="one-time-code"
      value={flow.code}
      disabled={busy || expired || isTerminalCodeError(error)}
      onChange={(event) => {
        flow.setCode(normalizeCode(event.currentTarget.value));
        if (!isTerminalCodeError(error)) flow.setError(undefined);
      }}
    />
  );
}

function IdentifierActions({ flow, onClose }: { flow: Flow; onClose: () => void }) {
  const account = useTranslations("accountHub");
  const auth = useTranslations("auth");
  const { busy, expired, error, challenge, resendSeconds } = flow;
  return (
    <div className="account-identifier-actions">
      <Button type="submit" isLoading={busy} disabled={expired || isTerminalCodeError(error)}>
        {challenge ? account("contactSave") : auth("sendCode")}
      </Button>
      {challenge && (
        <Button
          variant="ghost"
          disabled={busy || resendSeconds > 0}
          onClick={() => {
            void flow.sendCode();
          }}
        >
          {resendSeconds > 0
            ? auth("resendIn", { seconds: String(resendSeconds) })
            : auth("resendCode")}
        </Button>
      )}
      <Button variant="ghost" disabled={busy} onClick={onClose}>
        {account("contactCancel")}
      </Button>
    </div>
  );
}

export function IdentifierEditor({ onClose, ...props }: EditorProps) {
  const flow = useIdentifierEditor(props);
  return (
    <form
      className="account-identifier-form"
      aria-busy={flow.busy}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void (flow.challenge ? flow.verify() : flow.sendCode());
      }}
    >
      <IdentifierInput flow={flow} />
      <IdentifierActions flow={flow} onClose={onClose} />
    </form>
  );
}
