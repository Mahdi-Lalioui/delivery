import { problemResponseSchema } from "@zaafran/contracts/health";
import {
  mediaOutput,
  mediaUploadInput,
  photoUploadMaximumBytes,
  type mediaCropInput,
} from "@zaafran/contracts/media";

export type PhotoKind = "application" | "item";
export type Crop = ReturnType<typeof mediaCropInput.parse>;
export type PhotoImage = { width: number; height: number; blob: Blob };
export type SelectedPhoto = PhotoImage & { mediaId: string };

export interface PhotoScope {
  kind: PhotoKind;
  merchantId?: string | undefined;
  sessionId: string;
}

type Media = ReturnType<typeof mediaOutput.parse>;
type MediaReference = { scope: PhotoScope; mediaId: string };
type MediaAttempt = { scope: PhotoScope; key: string; progress?: Media };
type UploadAttempt = MediaAttempt & { file: File };
type CropAttempt = MediaAttempt & { mediaId: string; crop: Crop };
type PhotoErrorCode =
  | "contentMismatch"
  | "fileTooLarge"
  | "imageTooLarge"
  | "invalidFile"
  | "invalidImage"
  | "pollTimeout"
  | "requestError"
  | "retryError"
  | "sessionChanged";

export class PhotoError extends Error {
  constructor(readonly code: PhotoErrorCode) {
    super(code);
  }

  get canRetry() {
    return this.code === "retryError" || this.code === "pollTimeout";
  }
}

const extensions = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  webp: "image/webp",
} as const;

function uploadInput({ file, scope }: UploadAttempt) {
  if (file.size > photoUploadMaximumBytes) throw new PhotoError("fileTooLarge");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const inferred = Object.entries(extensions).find(([suffix]) => suffix === extension)?.[1];
  const fields = { contentType: file.type || inferred, bytes: file.size };
  const result = mediaUploadInput.safeParse(
    scope.kind === "application"
      ? { ...fields, kind: scope.kind }
      : { ...fields, kind: scope.kind, merchantId: scope.merchantId },
  );
  if (!result.success) throw new PhotoError("invalidFile");
  return result.data;
}

const rejectionCodes = {
  content_type_mismatch: "contentMismatch",
  invalid_image: "invalidImage",
  image_too_large: "imageTooLarge",
} as const;

const privateRequest = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

async function readHttpError(response: Response) {
  if (response.status === 401) return new PhotoError("sessionChanged");
  if (response.status === 413) return new PhotoError("fileTooLarge");
  if (response.status === 415) return new PhotoError("invalidFile");
  if (response.status === 429 || response.status >= 500) return new PhotoError("retryError");
  if (response.status === 409) {
    const payload: unknown = await response.json().catch(() => undefined);
    const problem = problemResponseSchema.safeParse(payload);
    if (problem.success && problem.data.code === "session_changed") {
      return new PhotoError("sessionChanged");
    }
  }
  return new PhotoError("requestError");
}

async function request<T>(
  options: { path: string; signal: AbortSignal; init?: RequestInit },
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { path, signal, init } = options;
  const deadline = AbortSignal.timeout(init?.method === "PUT" ? 120_000 : 15_000);
  const requestSignal = AbortSignal.any([signal, deadline]);
  try {
    signal.throwIfAborted();
    const response = await fetch(path, { ...init, ...privateRequest, signal: requestSignal });
    if (!response.ok) throw await readHttpError(response);
    const payload = await read(response);
    requestSignal.throwIfAborted();
    return payload;
  } catch (error) {
    signal.throwIfAborted();
    throw error instanceof PhotoError ? error : new PhotoError("retryError");
  }
}

function postCommand(attempt: MediaAttempt, body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": attempt.key,
      "x-expected-session-id": attempt.scope.sessionId,
    },
    body: JSON.stringify(body),
  };
}

function mediaPath(mediaId: string): string {
  return `/v1/media/${encodeURIComponent(mediaId)}`;
}

function readMedia(
  options: { path: string; signal: AbortSignal; init?: RequestInit },
  scope: PhotoScope,
  mediaId?: string,
): Promise<Media> {
  return request(options, async (response) => {
    const payload: unknown = await response.json();
    const result = mediaOutput.safeParse(payload);
    if (!result.success) throw new PhotoError("retryError");
    const media = result.data;
    if (media.sessionId !== scope.sessionId) throw new PhotoError("sessionChanged");
    if (media.kind !== scope.kind || (mediaId !== undefined && media.mediaId !== mediaId)) {
      throw new PhotoError("requestError");
    }
    if (media.status === "rejected") throw new PhotoError(rejectionCodes[media.reason]);
    return media;
  });
}

function waitForNextRead(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 2_000);
    function abort() {
      clearTimeout(timer);
      reject(new DOMException("Photo polling aborted", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function pollPhoto(attempt: MediaAttempt, initial: Media, signal: AbortSignal) {
  const deadline = AbortSignal.timeout(33_000);
  const pollSignal = AbortSignal.any([signal, deadline]);
  let media = initial;
  try {
    for (let reads = 0; reads < 16; reads++) {
      if (media.status !== "preparing" && media.status !== "processing") return media;
      await waitForNextRead(pollSignal);
      media = await readMedia(
        { path: mediaPath(media.mediaId), signal: pollSignal },
        attempt.scope,
        media.mediaId,
      );
      attempt.progress = media;
    }
  } catch (error) {
    signal.throwIfAborted();
    if (!deadline.aborted) throw error;
  }
  if (media.status !== "preparing" && media.status !== "processing") return media;
  throw new PhotoError("pollTimeout");
}

function readWebp(path: string, signal: AbortSignal): Promise<Blob> {
  return request({ path, signal }, async (response) => {
    const blob = await response.blob();
    if (blob.type !== "image/webp" || blob.size === 0) throw new PhotoError("retryError");
    return blob;
  });
}

async function reservePhoto(attempt: UploadAttempt, signal: AbortSignal) {
  const media = await readMedia(
    {
      path: "/v1/media/uploads",
      init: postCommand(attempt, uploadInput(attempt)),
      signal,
    },
    attempt.scope,
  );
  attempt.progress = media;
  return media;
}

async function uploadPhoto(attempt: UploadAttempt, mediaId: string, signal: AbortSignal) {
  const media = await readMedia(
    {
      path: `/v1/media/uploads/${encodeURIComponent(mediaId)}/content`,
      init: {
        method: "PUT",
        body: attempt.file,
        headers: {
          "Content-Type": "application/octet-stream",
          "x-expected-session-id": attempt.scope.sessionId,
        },
      },
      signal,
    },
    attempt.scope,
    mediaId,
  );
  attempt.progress = media;
  return media;
}

export async function preparePhoto(attempt: UploadAttempt, signal: AbortSignal) {
  let media = attempt.progress ?? (await reservePhoto(attempt, signal));
  if (media.status === "awaiting_upload") media = await uploadPhoto(attempt, media.mediaId, signal);
  const preview = await pollPhoto(attempt, media, signal);
  if (preview.status !== "awaiting_crop") throw new PhotoError("requestError");
  const blob = await readWebp(`${mediaPath(preview.mediaId)}/preview`, signal);
  return { ...preview, blob };
}

async function readVariant(media: Media, signal: AbortSignal): Promise<SelectedPhoto> {
  if (media.status !== "ready") throw new PhotoError("requestError");
  const variant = media.variants.find(({ format, width }) => format === "webp" && width === 640);
  if (!variant) throw new PhotoError("requestError");
  const { width, height } = variant;
  const { mediaId } = media;
  const blob = await readWebp(`${mediaPath(mediaId)}/variants/webp/${String(width)}`, signal);
  return { mediaId, blob, width, height };
}

async function submitCrop(attempt: CropAttempt, signal: AbortSignal) {
  const { mediaId, scope } = attempt;
  const media = await readMedia(
    { path: `${mediaPath(mediaId)}/crop`, init: postCommand(attempt, attempt.crop), signal },
    scope,
    mediaId,
  );
  attempt.progress = media;
  return media;
}

export async function finishPhoto(attempt: CropAttempt, signal: AbortSignal) {
  const media = attempt.progress ?? (await submitCrop(attempt, signal));
  return readVariant(await pollPhoto(attempt, media, signal), signal);
}

export async function readSelectedPhoto({ scope, mediaId }: MediaReference, signal: AbortSignal) {
  const media = await readMedia({ path: mediaPath(mediaId), signal }, scope, mediaId);
  return readVariant(media, signal);
}
