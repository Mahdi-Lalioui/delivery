import {
  requestOtpOutput,
  verifyOtpOutput,
  verifyTotpOutput,
  type requestOtpInput,
  type verifyOtpInput,
} from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";

type OtpRequest = ReturnType<typeof requestOtpInput.parse>;
export type OtpPurpose = OtpRequest["purpose"];
export type OtpAttempt = OtpRequest & { idempotencyKey: string };
type VerifyInput = Omit<ReturnType<typeof verifyOtpInput.parse>, "transport">;
export type VerifyAttempt = VerifyInput & { idempotencyKey: string };

const errorMessages = [
  ["otp_invalid", "otpInvalid"],
  ["otp_expired", "otpExpired"],
  ["otp_locked", "otpLocked"],
  ["otp_consumed", "otpConsumed"],
  ["otp_rate_limited", "otpRateLimited"],
  ["otp_delivery_unavailable", "otpDeliveryUnavailable"],
  ["totp_invalid", "totpInvalid"],
  ["totp_expired", "totpExpired"],
  ["totp_locked", "totpLocked"],
  ["totp_replayed", "totpReplayed"],
  ["totp_consumed", "totpConsumed"],
] as const;

export type AuthError = (typeof errorMessages)[number][1] | "networkError" | "unexpectedError";
interface AuthFailure {
  ok: false;
  error: AuthError;
  canRetrySameRequest: boolean;
}

type AuthResult<Output> = { ok: true; data: Output } | AuthFailure;

interface AuthPost<Output> {
  path: string;
  body: OtpRequest | (VerifyInput & { transport: "web" });
  idempotencyKey: string;
  output: {
    safeParse(value: unknown): { success: true; data: Output } | { success: false };
  };
}

function failure(error: AuthError, canRetrySameRequest: boolean): AuthFailure {
  return { ok: false, error, canRetrySameRequest };
}

function readProblem(payload: unknown): AuthError {
  const problem = problemResponseSchema.safeParse(payload);
  if (!problem.success) return "unexpectedError";

  return errorMessages.find(([code]) => code === problem.data.code)?.[1] ?? "unexpectedError";
}

async function postAuth<Output>({
  path,
  body,
  output,
  idempotencyKey,
}: AuthPost<Output>): Promise<AuthResult<Output>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
    });
  } catch {
    return failure("networkError", true);
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) return failure(readProblem(payload), response.status >= 500);

  const result = output.safeParse(payload);
  return result.success ? { ok: true, data: result.data } : failure("unexpectedError", true);
}

export function requestPhoneCode({ idempotencyKey, ...body }: OtpAttempt) {
  return postAuth({
    path: "/v1/auth/otp/request",
    body,
    idempotencyKey,
    output: requestOtpOutput,
  });
}

export async function verifyPhoneCode({ idempotencyKey, ...input }: VerifyAttempt) {
  const result = await postAuth({
    path: "/v1/auth/otp/verify",
    body: { ...input, transport: "web" },
    idempotencyKey,
    output: verifyOtpOutput,
  });
  if (!result.ok) return result;

  const { data } = result;
  return data.status === "totp_required" || data.transport === "web"
    ? { ok: true as const, data }
    : failure("unexpectedError", false);
}

export async function verifyAuthenticatorCode({ idempotencyKey, ...input }: VerifyAttempt) {
  const result = await postAuth({
    path: "/v1/auth/totp/verify",
    body: { ...input, transport: "web" },
    idempotencyKey,
    output: verifyTotpOutput,
  });
  if (!result.ok) return result;

  const { data } = result;
  return data.transport === "web" ? { ok: true as const, data } : failure("unexpectedError", false);
}
