"use client";

import { normalizedEmail } from "@zaafran/contracts/auth";
import type { PublicLocale } from "@zaafran/i18n/locales";
import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { useEffect, useRef, useState } from "react";
import {
  chooseOtpAttempt,
  chooseVerificationAttempt,
  isTerminalCodeError,
  normalizeCode,
  secondsUntil,
  type SignInStep,
} from "./auth-flow";
import {
  requestSignInCode,
  verifyAuthenticatorCode,
  verifySignInCode,
  type AuthError,
  type OtpAttempt,
  type OtpPurpose,
  type SignInMethod,
  type SignInIdentifier,
  type VerifyAttempt,
} from "./auth-http";

type FormError = AuthError | "invalidPhone" | "invalidEmail" | "invalidCode";
type PendingAction = "send" | "verify";

function getStepError(step: SignInStep, error: FormError | undefined, now: number) {
  if (step.kind === "phone" || step.kind === "done" || step.expiresAt > now) return error;
  return isTerminalCodeError(error) ? error : step.kind === "otp" ? "otpExpired" : "totpExpired";
}

function readIdentifier(method: SignInMethod, value: string): SignInIdentifier | undefined {
  if (method === "phone") {
    const phone = normalizeAlgerianPhone(value);
    return phone ? { phone } : undefined;
  }
  const email = normalizedEmail.safeParse(value);
  return email.success ? { email: email.data } : undefined;
}

function otpIdentifier(step: Extract<SignInStep, { kind: "otp" }>): SignInIdentifier {
  return step.email === undefined ? { phone: step.phone } : { email: step.email };
}

function canSendCode(step: SignInStep): boolean {
  return step.kind === "phone" || (step.kind === "otp" && Date.now() >= step.resendAt);
}

export function useSignIn(
  purpose: OtpPurpose,
  methods: readonly SignInMethod[],
  locale: PublicLocale | undefined,
) {
  const [step, setStep] = useState<SignInStep>({ kind: "phone" });
  const [preferredMethod, setPreferredMethod] = useState<SignInMethod>("phone");
  const method = methods.includes(preferredMethod) ? preferredMethod : (methods[0] ?? "phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<FormError>();
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState<PendingAction>();
  const [retryRequest, setRetryRequest] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<OtpAttempt | undefined>(undefined);
  const verification = useRef<VerifyAttempt | undefined>(undefined);

  useEffect(() => {
    if (step.kind !== "otp" && step.kind !== "totp") return;
    const latestDeadline =
      step.kind === "otp" ? Math.max(step.expiresAt, step.resendAt) : step.expiresAt;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= latestDeadline) window.clearInterval(timer);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [step]);

  function restart() {
    if (inFlight.current) return;
    attempt.current = undefined;
    verification.current = undefined;
    setRetryRequest(false);
    setStep({ kind: "phone" });
    setCode("");
    setError(undefined);
  }

  function changeMethod(next: SignInMethod) {
    if (inFlight.current || method === next) return;
    restart();
    setPreferredMethod(next);
  }

  function updateIdentifier(channel: SignInMethod, value: string) {
    if (channel === "email") setEmail(value);
    else setPhone(value);
    setError(undefined);
    const updated = readIdentifier(channel, value);
    setRetryRequest(
      Boolean(
        updated &&
        attempt.current &&
        updated.email === attempt.current.email &&
        updated.phone === attempt.current.phone,
      ),
    );
  }

  function updateCode(value: string) {
    setCode(normalizeCode(value));
    if (!isTerminalCodeError(error)) setError(undefined);
  }

  async function sendCode() {
    if (inFlight.current || !canSendCode(step)) return;

    const entered = method === "email" ? email : phone;
    const identifier = step.kind === "otp" ? otpIdentifier(step) : readIdentifier(method, entered);
    if (!identifier) {
      setError(method === "email" ? "invalidEmail" : "invalidPhone");
      return;
    }

    attempt.current = chooseOtpAttempt({ ...identifier, purpose, previous: attempt.current });
    inFlight.current = true;
    setError(undefined);
    setPending("send");
    const result = await requestSignInCode({ ...attempt.current, locale });
    inFlight.current = false;
    setPending(undefined);
    if (!result.ok) {
      if (!result.canRetrySameRequest) attempt.current = undefined;
      setRetryRequest(result.canRetrySameRequest);
      setError(result.error);
      return;
    }

    attempt.current = undefined;
    verification.current = undefined;
    setRetryRequest(false);
    setCode("");
    setError(undefined);
    setNow(Date.now());
    setStep({
      kind: "otp",
      ...identifier,
      challengeId: result.data.challengeId,
      expiresAt: Date.parse(result.data.expiresAt),
      resendAt: Date.parse(result.data.resendAt),
    });
  }

  async function verifyCode() {
    if (inFlight.current || !("challengeId" in step)) return;
    if (Date.now() >= step.expiresAt || isTerminalCodeError(error)) return;
    if (code.length !== 6) {
      setError("invalidCode");
      return;
    }

    inFlight.current = true;
    setError(undefined);
    setPending("verify");
    verification.current = chooseVerificationAttempt({
      challengeId: step.challengeId,
      code,
      previous: verification.current,
    });
    const verify = step.kind === "otp" ? verifySignInCode : verifyAuthenticatorCode;
    const result = await verify(verification.current);
    inFlight.current = false;
    setPending(undefined);
    if (!result.ok) {
      if (!result.canRetrySameRequest) verification.current = undefined;
      setError(result.error);
      return;
    }

    verification.current = undefined;
    setError(undefined);
    setCode("");
    const current = Date.now();
    setNow(current);
    setStep(
      result.data.status === "totp_required"
        ? {
            kind: "totp",
            challengeId: result.data.challengeId,
            expiresAt: current + result.data.expiresInSeconds * 1000,
          }
        : { kind: "done" },
    );
  }

  const stepError = getStepError(step, error, now);
  return {
    step,
    method,
    phone,
    email,
    code,
    error: stepError,
    pending,
    retryRequest,
    resendSeconds: step.kind === "otp" ? secondsUntil(step.resendAt, now) : 0,
    canVerify: (step.kind === "otp" || step.kind === "totp") && !isTerminalCodeError(stepError),
    setMethod: changeMethod,
    setPhone: (value: string) => {
      updateIdentifier("phone", value);
    },
    setEmail: (value: string) => {
      updateIdentifier("email", value);
    },
    setCode: updateCode,
    sendCode,
    verifyCode,
    restart,
  };
}

export type SignInFlow = ReturnType<typeof useSignIn>;
