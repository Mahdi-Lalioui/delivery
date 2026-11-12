import type {
  AuthError,
  OtpAttempt,
  OtpPurpose,
  SignInIdentifier,
  VerifyAttempt,
} from "./auth-http";

type OtpStep = SignInIdentifier & {
  kind: "otp";
  challengeId: string;
  expiresAt: number;
  resendAt: number;
};
type TotpStep = { kind: "totp"; challengeId: string; expiresAt: number };
export type SignInStep = { kind: "phone" } | OtpStep | TotpStep | { kind: "done" };

export function getSignInPurpose(value: string | string[] | undefined): OtpPurpose {
  return value === "admin" ? "admin_sign_in" : "sign_in";
}

export function chooseOtpAttempt({
  purpose,
  previous,
  ...identifier
}: SignInIdentifier & {
  purpose: OtpPurpose;
  previous?: OtpAttempt | undefined;
}): OtpAttempt {
  if (
    previous &&
    previous.purpose === purpose &&
    previous.phone === identifier.phone &&
    previous.email === identifier.email
  )
    return previous;
  return { ...identifier, purpose, idempotencyKey: crypto.randomUUID() };
}

export function chooseVerificationAttempt({
  challengeId,
  code,
  previous,
}: {
  challengeId: string;
  code: string;
  previous?: VerifyAttempt | undefined;
}): VerifyAttempt {
  if (previous?.challengeId === challengeId && previous.code === code) return previous;
  return { challengeId, code, idempotencyKey: crypto.randomUUID() };
}

export function normalizeCode(input: string): string {
  return input
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const zero = digit >= "۰" ? "۰" : "٠";
      return String(digit.charCodeAt(0) - zero.charCodeAt(0));
    })
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

const terminalErrors: ReadonlySet<AuthError> = new Set([
  "otpExpired",
  "otpLocked",
  "otpConsumed",
  "totpExpired",
  "totpLocked",
  "totpConsumed",
]);

export function isTerminalCodeError(
  error: AuthError | "invalidCode" | "invalidPhone" | "invalidEmail" | undefined,
) {
  return (
    error !== undefined &&
    error !== "invalidCode" &&
    error !== "invalidPhone" &&
    error !== "invalidEmail" &&
    terminalErrors.has(error)
  );
}
