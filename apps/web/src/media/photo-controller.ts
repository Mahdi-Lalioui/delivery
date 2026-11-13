import { finishPhotoCrop, startPhotoUpload, type PhotoClient } from "./media-flow";
import type { PhotoCrop } from "./media-http";
import { initialPhotoState, reducePhoto, type PhotoEvent, type PhotoState } from "./photo-state";

type FlowInput = Parameters<typeof startPhotoUpload>[0];

export interface PhotoUploadOptions {
  readonly target: FlowInput["target"];
  readonly sessionId: string;
  readonly client?: PhotoClient;
  readonly wait?: FlowInput["wait"];
  readonly newKey?: () => string;
}

export function photoPreviewUrl(mediaId: string): string {
  return `/v1/media/${encodeURIComponent(mediaId)}/preview`;
}

/**
 * Owns one photo at a time. Each step holds an abort token, so reset, a newer file or unmount
 * cancels the request and discards its late result.
 */
export function createPhotoController(options: PhotoUploadOptions) {
  const { target, sessionId, newKey = () => crypto.randomUUID() } = options;
  const flow = {
    sessionId,
    ...(options.client ? { client: options.client } : {}),
    ...(options.wait ? { wait: options.wait } : {}),
  };
  let state = initialPhotoState;
  let operation: AbortController | undefined;
  const listeners = new Set<() => void>();

  function dispatch(event: PhotoEvent) {
    const next = reducePhoto(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function cancel() {
    operation?.abort();
    operation = undefined;
  }

  function begin(): AbortSignal {
    cancel();
    operation = new AbortController();
    return operation.signal;
  }

  async function upload(file: File, signal: AbortSignal) {
    const step = await startPhotoUpload({
      ...flow,
      file,
      target,
      idempotencyKey: newKey(),
      signal,
    });
    if (!signal.aborted) dispatch({ kind: "uploaded", step });
  }

  async function save(mediaId: string, crop: PhotoCrop, signal: AbortSignal) {
    const step = await finishPhotoCrop({ ...flow, mediaId, crop, signal });
    if (!signal.aborted) dispatch({ kind: "cropped", step });
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: (): PhotoState => state,
    choose: (file: File) => {
      if (state.kind !== "idle" && state.kind !== "ready") return;
      dispatch({ kind: "choose" });
      void upload(file, begin());
    },
    adjust: (crop: PhotoCrop) => {
      dispatch({ kind: "adjust", crop });
    },
    confirm: () => {
      if (state.kind !== "cropping") return;
      const { photo, crop } = state;
      dispatch({ kind: "confirm" });
      void save(photo.mediaId, crop, begin());
    },
    reset: () => {
      cancel();
      dispatch({ kind: "reset" });
    },
    dispose: cancel,
  };
}
