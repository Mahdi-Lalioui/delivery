import {
  authMethodsOutput,
  type changeIdentifierChallengeInput,
  type changeIdentifierInput,
  verifiedIdentifiersOutput,
  requestOtpOutput,
  verifyOtpOutput,
  verifyTotpOutput,
  type requestIdentifierOtpInput,
  type verifyOtpInput,
} from "@zaafran/contracts/auth";
import { problemResponseSchema } from "@zaafran/contracts/health";

type SignInFields = Pick<ReturnType<typeof requestIdentifierOtpInput.parse>, "purpose" | "locale">;
export type SignInIdentifier = { phone: string; email?: never } | { email: string; phone?: never };
type OtpRequest = SignInIdentifier & SignInFields;
export type SignInMethod = ReturnType<typeof authMethodsOutput.parse>["methods"][number];
export type OtpPurpose = OtpRequest["purpose"];
export type OtpAttempt = OtpRequest & { idempotencyKey: string };
type LinkChallengeInput = ReturnType<typeof changeIdentifierChallengeInput.parse>;
type LinkInput = ReturnType<typeof changeIdentifierInput.parse>;
type VerifyInput = Omit<ReturnType<typeof verifyOtpInput.parse>, "transport">;
export type VerifyAttempt = VerifyInput & { idempotencyKey: string };

const errorMessages = [
  ["identifier_unavailable", "identifierUnavailable"],
  ["identifier_changed", "sessionChanged"],
  ["session_changed", "sessionChanged"],
  ["unauthenticated", "sessionChanged"],
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
  body: OtpRequest | LinkChallengeInput | LinkInput | (VerifyInput & { transport: "web" });
  method?: "POST" | "PUT";
  sessionId?: string;
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
  method = "POST",
  sessionId,
}: AuthPost<Output>): Promise<AuthResult<Output>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...(sessionId === undefined ? {} : { "X-Expected-Session-Id": sessionId }),
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

export function requestIdentifierCode(
  body: LinkChallengeInput,
  sessionId: string,
  idempotencyKey: string,
) {
  return postAuth({
    path: "/v1/me/identifiers/challenge",
    body,
    sessionId,
    idempotencyKey,
    output: requestOtpOutput,
  });
}

export function confirmIdentifierCode(
  { idempotencyKey, ...body }: VerifyAttempt,
  sessionId: string,
) {
  return postAuth({
    path: "/v1/me/identifiers",
    method: "PUT",
    body,
    sessionId,
    idempotencyKey,
    output: verifiedIdentifiersOutput,
  });
}

export async function readSignInMethods(signal: AbortSignal): Promise<SignInMethod[] | undefined> {
  try {
    const response = await fetch("/v1/auth/methods", {
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return undefined;
    const data = authMethodsOutput.safeParse(await response.json());
    return data.success ? data.data.methods : undefined;
  } catch {
    return undefined;
  }
}

export function requestSignInCode({ idempotencyKey, ...body }: OtpAttempt) {
  return postAuth({
    path: "/v1/auth/otp/request",
    body,
    idempotencyKey,
    output: requestOtpOutput,
  });
}

export async function verifySignInCode({ idempotencyKey, ...input }: VerifyAttempt) {
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
