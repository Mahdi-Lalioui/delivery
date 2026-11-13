import { mediaUploadInput, photoUploadMaximumBytes } from "@zaafran/contracts/media";
import * as photoHttp from "./media-http";
import type { PhotoCrop, PhotoResult } from "./media-http";

type Photo = Extract<PhotoResult, { kind: "ready" }>["data"];
type Failure = Exclude<PhotoResult, { kind: "ready" }>;
type Rejected = Extract<Photo, { status: "rejected" }>;

export type PhotoClient = Pick<
  typeof photoHttp,
  "reservePhoto" | "uploadPhotoContent" | "readPhoto" | "choosePhotoCrop"
>;

type PhotoTarget =
  { kind: "application" } | { kind: "cover" | "item" | "logo"; merchantId: string };

interface FlowOptions {
  readonly sessionId: string;
  readonly signal: AbortSignal;
  readonly client?: PhotoClient;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly maxPolls?: number;
  readonly pollMs?: number;
}

type Settled<Status extends Photo["status"]> =
  | { kind: "settled"; photo: Extract<Photo, { status: Status }> }
  | { kind: "rejected"; reason: Rejected["reason"] }
  | Failure
  | { kind: "timed-out" };

export type PhotoUploadStep =
  | { kind: "crop"; photo: Extract<Photo, { status: "awaiting_crop" }> }
  | Exclude<Settled<"awaiting_crop">, { kind: "settled" }>
  | { kind: "too-large" | "unsupported-type" };

export type PhotoCropStep =
  | { kind: "ready"; photo: Extract<Photo, { status: "ready" }> }
  | Exclude<Settled<"ready">, { kind: "settled" }>;

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    const stop = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

function hasStatus<Status extends Photo["status"]>(
  photo: Photo,
  status: Status,
): photo is Extract<Photo, { status: Status }> {
  return photo.status === status;
}

function settle<Status extends Photo["status"]>(
  photo: Photo,
  status: Status,
): Settled<Status> | undefined {
  if (photo.status === "rejected") return { kind: "rejected", reason: photo.reason };
  return hasStatus(photo, status) ? { kind: "settled", photo } : undefined;
}

/** Reads the photo until the worker reaches `status` or rejects it, at most `maxPolls` times. */
async function pollUntil<Status extends Photo["status"]>(
  first: Photo,
  status: Status,
  options: FlowOptions & { mediaId: string },
): Promise<Settled<Status>> {
  const { client = photoHttp, wait = delay, maxPolls = 60, pollMs = 1_000 } = options;
  const { mediaId, sessionId, signal } = options;
  let photo = first;
  for (let poll = 0; ; poll += 1) {
    const settled = settle(photo, status);
    if (settled) return settled;
    if (poll >= maxPolls || signal.aborted) return { kind: "timed-out" };
    await wait(pollMs, signal);
    const read = await client.readPhoto({ mediaId, sessionId, signal });
    if (read.kind !== "ready") return read;
    photo = read.data;
  }
}

function describeFile(file: File, target: PhotoTarget) {
  if (file.size > photoUploadMaximumBytes) return { kind: "too-large" } as const;
  const parsed = mediaUploadInput.safeParse({
    ...target,
    contentType: file.type,
    bytes: file.size,
  });
  return parsed.success ? parsed.data : ({ kind: "unsupported-type" } as const);
}

export async function startPhotoUpload(
  options: FlowOptions & { file: File; target: PhotoTarget; idempotencyKey: string },
): Promise<PhotoUploadStep> {
  const { file, target, idempotencyKey, sessionId, signal, client = photoHttp } = options;
  const input = describeFile(file, target);
  if (!("contentType" in input)) return input;

  const reserved = await client.reservePhoto({ input, sessionId, idempotencyKey, signal });
  if (reserved.kind !== "ready") return reserved;
  const { mediaId } = reserved.data;
  let photo = reserved.data;
  if (photo.status === "awaiting_upload") {
    const uploaded = await client.uploadPhotoContent({ mediaId, sessionId, file, signal });
    if (uploaded.kind !== "ready") return uploaded;
    photo = uploaded.data;
  }
  const settled = await pollUntil(photo, "awaiting_crop", { ...options, mediaId });
  return settled.kind === "settled" ? { kind: "crop", photo: settled.photo } : settled;
}

export async function finishPhotoCrop(
  options: FlowOptions & { mediaId: string; crop: PhotoCrop },
): Promise<PhotoCropStep> {
  const { mediaId, crop, sessionId, signal, client = photoHttp } = options;
  const chosen = await client.choosePhotoCrop({ mediaId, sessionId, crop, signal });
  if (chosen.kind !== "ready") return chosen;
  const settled = await pollUntil(chosen.data, "ready", options);
  return settled.kind === "settled" ? { kind: "ready", photo: settled.photo } : settled;
}
