import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  customerPrivacyDeleteInput,
  customerPrivacyExportOutput,
} from "@zaafran/contracts/retention";

// CUS-24 privacy client. Export uses lane A's contract (GET /v1/me/export). Deletion re-confirms
// with a fresh OTP; the challenge route is requested in docs/requests/lane-b-privacy.md.

export type PrivacyExport = ReturnType<typeof customerPrivacyExportOutput.parse>;
type Failure = { kind: "sign-in" | "rate-limited" | "error" };
export type ExportResult = { kind: "ready"; data: PrivacyExport } | Failure;
export type ChallengeResult = { kind: "sent"; challengeId: string } | Failure;
export type DeleteResult =
  | { kind: "deleted" }
  | { kind: "invalid-code" | "expired" }
  /** The request was sent but no answer came back: the account may already be deleted. */
  | { kind: "unknown" }
  | Failure;

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function failure(status: number): Failure {
  if (status === 401 || status === 403) return { kind: "sign-in" };
  return { kind: status === 429 ? "rate-limited" : "error" };
}

export async function exportMyData(): Promise<ExportResult> {
  try {
    const response = await fetch("/v1/me/export", requestOptions);
    if (!response.ok) return failure(response.status);
    const output = customerPrivacyExportOutput.safeParse(await response.json());
    return output.success ? { kind: "ready", data: output.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

function readChallengeId(body: unknown): unknown {
  return typeof body === "object" && body !== null && "challengeId" in body
    ? body.challengeId
    : undefined;
}

/** Sends a 6-digit code to the account's phone; the key makes a retried tap send only once. */
export async function requestDeletionCode(key: string): Promise<ChallengeResult> {
  try {
    const response = await fetch("/v1/me/deletion-challenge", {
      ...requestOptions,
      method: "POST",
      headers: { "Idempotency-Key": key },
    });
    if (!response.ok) return failure(response.status);
    const body: unknown = await response.json();
    const parsed = customerPrivacyDeleteInput.shape.challengeId.safeParse(readChallengeId(body));
    return parsed.success ? { kind: "sent", challengeId: parsed.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

async function codeProblem(response: Response): Promise<DeleteResult> {
  const problem = problemResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (!problem.success) return { kind: "error" };
  if (problem.data.code === "challenge_expired") return { kind: "expired" };
  return { kind: problem.data.code === "invalid_code" ? "invalid-code" : "error" };
}

/** Accepts autofilled or pasted codes: drops spaces and maps Arabic-Indic digits to 0–9. */
export function normalizeCode(code: string): string {
  return code
    .replace(/\s/g, "")
    .replace(/[٠-٩۰-۹]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit >= "۰" ? "۰".charCodeAt(0) : "٠".charCodeAt(0))),
    );
}

/** CUS-24: deletes (anonymises) the account after the code is verified. Irreversible. */
export async function confirmDeletion(input: {
  challengeId: string;
  code: string;
}): Promise<DeleteResult> {
  const body = customerPrivacyDeleteInput.safeParse({
    challengeId: input.challengeId,
    code: normalizeCode(input.code),
  });
  if (!body.success) return { kind: "invalid-code" };
  try {
    const response = await fetch("/v1/me", {
      ...requestOptions,
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.data),
    });
    if (response.ok) return { kind: "deleted" };
    if (response.status === 400 || response.status === 409) return await codeProblem(response);
    return failure(response.status);
  } catch {
    return { kind: "unknown" };
  }
}

/** The export as a pretty JSON file the customer can keep. */
export function exportFile(data: PrivacyExport): Blob {
  return new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
}
