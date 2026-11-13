import { problemResponseSchema } from "@zaafran/contracts/health";
import { type mediaCropInput, mediaOutput, type mediaUploadInput } from "@zaafran/contracts/media";

export type PhotoUploadInput = ReturnType<typeof mediaUploadInput.parse>;
export type PhotoCrop = ReturnType<typeof mediaCropInput.parse>;
type Photo = ReturnType<typeof mediaOutput.parse>;

type Rejection =
  | "sign-in"
  | "forbidden"
  | "too-large"
  | "unsupported-type"
  | "session-changed"
  | "idempotency-conflict"
  | "content-mismatch"
  | "upload-conflict"
  | "crop-conflict"
  | "crop-unavailable";

type PhotoFailure = { kind: Rejection } | { kind: "error" | "rate-limited"; shouldRetry: boolean };
export type PhotoResult = { kind: "ready"; data: Photo } | PhotoFailure;

interface PhotoRequest {
  readonly sessionId: string;
  readonly signal: AbortSignal;
}

interface PhotoTarget extends PhotoRequest {
  readonly mediaId: string;
}

const privateRequest = {
  cache: "no-store",
  credentials: "same-origin",
  redirect: "error",
} satisfies RequestInit;

const statusFailures = new Map<number, Rejection>([
  [401, "sign-in"],
  [403, "forbidden"],
  [404, "forbidden"],
  [413, "too-large"],
  [415, "unsupported-type"],
]);

const conflictCodes = new Map<string, Rejection>([
  ["session_changed", "session-changed"],
  ["idempotency_conflict", "idempotency-conflict"],
  ["content_mismatch", "content-mismatch"],
  ["upload_conflict", "upload-conflict"],
  ["crop_conflict", "crop-conflict"],
  ["crop_unavailable", "crop-unavailable"],
]);

async function readProblemCode(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const result = problemResponseSchema.safeParse(body);
  return result.success && result.data.status === response.status ? result.data.code : undefined;
}

async function classifyFailure(response: Response): Promise<PhotoFailure> {
  const rejection = statusFailures.get(response.status);
  if (rejection) return { kind: rejection };
  if (response.status === 429) return { kind: "rate-limited", shouldRetry: true };
  const code = response.status === 409 ? await readProblemCode(response) : undefined;
  const conflict = code === undefined ? undefined : conflictCodes.get(code);
  return conflict ? { kind: conflict } : { kind: "error", shouldRetry: response.status >= 500 };
}

/** Parses the photo and checks it belongs to this session and, when known, this photo. */
function readOwnPhoto(body: unknown, { sessionId, mediaId }: PhotoRequest & { mediaId?: string }) {
  const result = mediaOutput.safeParse(body);
  if (!result.success) return { kind: "error", shouldRetry: true } as const;
  if (result.data.sessionId !== sessionId) return { kind: "session-changed" } as const;
  if (mediaId !== undefined && result.data.mediaId !== mediaId.toLowerCase()) {
    return { kind: "error", shouldRetry: true } as const;
  }
  return { kind: "ready", data: result.data } as const;
}

async function request(
  path: string,
  init: RequestInit,
  expected: PhotoRequest & { mediaId?: string },
): Promise<PhotoResult> {
  try {
    const response = await fetch(path, { ...init, ...privateRequest });
    if (!response.ok) return await classifyFailure(response);
    return readOwnPhoto(await response.json(), expected);
  } catch {
    return { kind: "error", shouldRetry: true };
  }
}

function photoPath(mediaId: string) {
  return `/v1/media/${encodeURIComponent(mediaId)}`;
}

export function reservePhoto({
  input,
  sessionId,
  idempotencyKey,
  signal,
}: PhotoRequest & { input: PhotoUploadInput; idempotencyKey: string }): Promise<PhotoResult> {
  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
    "x-expected-session-id": sessionId,
  };
  const init = { method: "POST", signal, headers, body: JSON.stringify(input) };
  return request("/v1/media/uploads", init, { sessionId, signal });
}

export function uploadPhotoContent({
  mediaId,
  sessionId,
  file,
  signal,
}: PhotoTarget & { file: Blob }): Promise<PhotoResult> {
  const headers = {
    "Content-Type": "application/octet-stream",
    "x-expected-session-id": sessionId,
  };
  const init = { method: "PUT", signal, headers, body: file };
  return request(`/v1/media/uploads/${encodeURIComponent(mediaId)}/content`, init, {
    sessionId,
    signal,
    mediaId,
  });
}

export function readPhoto({ mediaId, sessionId, signal }: PhotoTarget): Promise<PhotoResult> {
  return request(photoPath(mediaId), { method: "GET", signal }, { sessionId, signal, mediaId });
}

export function choosePhotoCrop({
  mediaId,
  sessionId,
  crop,
  signal,
}: PhotoTarget & { crop: PhotoCrop }): Promise<PhotoResult> {
  const headers = { "Content-Type": "application/json", "x-expected-session-id": sessionId };
  const init = { method: "PUT", signal, headers, body: JSON.stringify(crop) };
  return request(`${photoPath(mediaId)}/crop`, init, { sessionId, signal, mediaId });
}
