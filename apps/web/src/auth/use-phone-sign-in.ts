"use client";

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
  requestPhoneCode,
  verifyAuthenticatorCode,
  verifyPhoneCode,
  type AuthError,
  type OtpAttempt,
  type OtpPurpose,
  type VerifyAttempt,
} from "./auth-http";

type FormError = AuthError | "invalidPhone" | "invalidCode";
type PendingAction = "send" | "verify";

function getStepError(step: SignInStep, error: FormError | undefined, now: number) {
  if (step.kind === "phone" || step.kind === "done" || step.expiresAt > now) return error;
  return isTerminalCodeError(error) ? error : step.kind === "otp" ? "otpExpired" : "totpExpired";
}

export function usePhoneSignIn(purpose: OtpPurpose) {
  const [step, setStep] = useState<SignInStep>({ kind: "phone" });
  const [phone, setPhone] = useState("");
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

  function updatePhone(value: string) {
    setPhone(value);
    setError(undefined);
    setRetryRequest(attempt.current?.phone === normalizeAlgerianPhone(value));
  }

  function updateCode(value: string) {
    setCode(normalizeCode(value));
    if (!isTerminalCodeError(error)) setError(undefined);
  }

  async function sendCode() {
    if (inFlight.current || (step.kind !== "phone" && step.kind !== "otp")) return;
    if (step.kind === "otp" && Date.now() < step.resendAt) return;

    const normalized = step.kind === "otp" ? step.phone : normalizeAlgerianPhone(phone);
    if (!normalized) {
      setError("invalidPhone");
      return;
    }

    attempt.current = chooseOtpAttempt({ phone: normalized, purpose, previous: attempt.current });
    inFlight.current = true;
    setError(undefined);
    setPending("send");
    const result = await requestPhoneCode(attempt.current);
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
      phone: normalized,
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
    const verify = step.kind === "otp" ? verifyPhoneCode : verifyAuthenticatorCode;
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
    phone,
    code,
    error: stepError,
    pending,
    retryRequest,
    resendSeconds: step.kind === "otp" ? secondsUntil(step.resendAt, now) : 0,
    canVerify: (step.kind === "otp" || step.kind === "totp") && !isTerminalCodeError(stepError),
    setPhone: updatePhone,
    setCode: updateCode,
    sendCode,
    verifyCode,
    restart,
  };
}

export type PhoneSignIn = ReturnType<typeof usePhoneSignIn>;
