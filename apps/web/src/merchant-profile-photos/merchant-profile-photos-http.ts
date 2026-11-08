import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  merchantProfilePhotosInput,
  merchantProfilePhotosOutput,
} from "@zaafran/contracts/merchant";
import type { MerchantRead } from "../merchant/merchant-http";

export type ProfilePhotos = ReturnType<typeof merchantProfilePhotosOutput.parse>;
export type PhotoIds = Pick<ProfilePhotos, "coverPhotoId" | "logoPhotoId">;

interface ProfilePhotosAttempt {
  input: ReturnType<typeof merchantProfilePhotosInput.parse>;
  sessionId: string;
  key: string;
}

export type ProfilePhotosAccess = "unauthenticated" | "forbidden" | "session-changed";
type SaveFailure =
  | { kind: ProfilePhotosAccess | "revision-conflict" | "photos-unavailable" }
  | { kind: "error"; retry: boolean };
export type SaveResult = { kind: "saved"; data: ProfilePhotos } | SaveFailure;

const privateRequest = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

function profilePath(merchantId: string) {
  return `/v1/merchants/${encodeURIComponent(merchantId)}/profile/photos`;
}

export function samePhotoIds(left: PhotoIds, right: PhotoIds) {
  return left.coverPhotoId === right.coverPhotoId && left.logoPhotoId === right.logoPhotoId;
}

export function makeProfilePhotosAttempt(
  { sessionId, revision }: ProfilePhotos,
  photos: PhotoIds,
  previous?: ProfilePhotosAttempt,
): ProfilePhotosAttempt {
  if (
    previous?.sessionId === sessionId &&
    previous.input.expectedRevision === revision &&
    samePhotoIds(previous.input, photos)
  )
    return previous;

  return { input: { ...photos, expectedRevision: revision }, sessionId, key: crypto.randomUUID() };
}

async function readResponse(response: Response) {
  const data: unknown = await response.json();
  return merchantProfilePhotosOutput.safeParse(data);
}

interface ProfileRequest {
  merchantId: string;
  signal: AbortSignal;
}

export async function readProfilePhotos({
  merchantId,
  signal,
}: ProfileRequest): Promise<MerchantRead<ProfilePhotos>> {
  try {
    const response = await fetch(profilePath(merchantId), {
      ...privateRequest,
      method: "GET",
      signal,
    });
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
    if (!response.ok) return { kind: "error" };
    const result = await readResponse(response);
    if (result.success) return { kind: "ready", data: result.data };
  } catch {
    return { kind: "error" };
  }
  return { kind: "error" };
}

async function readConflict(response: Response): Promise<SaveFailure> {
  const data: unknown = await response.json().catch(() => undefined);
  const problem = problemResponseSchema.safeParse(data);
  if (problem.success && problem.data.status === 409) {
    switch (problem.data.code) {
      case "session_changed":
        return { kind: "session-changed" };
      case "revision_conflict":
        return { kind: "revision-conflict" };
      case "photos_unavailable":
        return { kind: "photos-unavailable" };
    }
  }
  return { kind: "error", retry: false };
}

async function readSaveFailure(response: Response): Promise<SaveFailure> {
  if (response.status === 401) return { kind: "unauthenticated" };
  if (response.status === 403 || response.status === 404) return { kind: "forbidden" };
  if (response.status === 409) return readConflict(response);
  return { kind: "error", retry: response.status === 429 || response.status >= 500 };
}

async function readSaveReceipt(
  response: Response,
  attempt: ProfilePhotosAttempt,
): Promise<SaveResult> {
  const result = await readResponse(response);
  if (!result.success) return { kind: "error", retry: true };
  if (result.data.sessionId !== attempt.sessionId) return { kind: "session-changed" };
  if (
    result.data.revision <= attempt.input.expectedRevision ||
    !samePhotoIds(attempt.input, result.data)
  )
    return { kind: "error", retry: true };
  return { kind: "saved", data: result.data };
}

export async function saveProfilePhotos({
  merchantId,
  attempt,
  signal,
}: ProfileRequest & { attempt: ProfilePhotosAttempt }): Promise<SaveResult> {
  if (!merchantProfilePhotosInput.safeParse(attempt.input).success)
    return { kind: "error", retry: false };
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  try {
    requestSignal.throwIfAborted();
    const response = await fetch(profilePath(merchantId), {
      ...privateRequest,
      method: "PUT",
      signal: requestSignal,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": attempt.key,
        "x-expected-session-id": attempt.sessionId,
      },
      body: JSON.stringify(attempt.input),
    });
    const result = await (response.ok
      ? readSaveReceipt(response, attempt)
      : readSaveFailure(response));
    requestSignal.throwIfAborted();
    return result;
  } catch {
    return { kind: "error", retry: true };
  }
}
