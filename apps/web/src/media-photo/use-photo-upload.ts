import { useLayoutEffect, useRef, useState } from "react";
import {
  finishPhoto,
  PhotoError,
  preparePhoto,
  type Crop,
  type PhotoImage,
  type PhotoScope,
  type SelectedPhoto,
} from "./media-photo-http";

type Preview = PhotoImage & { mediaId: string };
type PhotoStep = { kind: "crop"; photo: Preview } | { kind: "ready"; photo: SelectedPhoto };
type PhotoTask = (signal: AbortSignal) => Promise<PhotoStep>;
type PendingStep = "preparing" | "processing";
type UploadState =
  | { kind: "idle" }
  | { kind: PendingStep }
  | { kind: "crop"; photo: Preview }
  | { kind: "error"; error: PhotoError; retry?: () => void };

interface PhotoUploadOptions {
  scope: PhotoScope | null;
  onChange: (mediaId: string | null) => void;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}

export function usePhotoUpload({ scope, onChange, onBusyChange }: PhotoUploadOptions) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [selected, setSelected] = useState<SelectedPhoto>();
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const callbacks = useRef({ onChange, onBusyChange });

  useLayoutEffect(() => {
    callbacks.current = { onChange, onBusyChange };
  }, [onChange, onBusyChange]);

  useLayoutEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      if (busy.current) {
        busy.current = false;
        callbacks.current.onBusyChange?.(false);
      }
    },
    [],
  );

  function setBusy(value: boolean) {
    if (busy.current === value) return;
    busy.current = value;
    callbacks.current.onBusyChange?.(value);
  }

  function cancel() {
    active.current?.abort();
    active.current = null;
    setState({ kind: "idle" });
    setBusy(false);
  }

  async function runTask(task: PhotoTask, pending: PendingStep, signal: AbortSignal) {
    try {
      const result = await task(signal);
      if (signal.aborted) return;
      if (result.kind === "crop") {
        setState(result);
        return;
      }
      setSelected(result.photo);
      setState({ kind: "idle" });
      callbacks.current.onChange(result.photo.mediaId);
      setBusy(false);
    } catch (cause) {
      if (signal.aborted) return;
      const error = cause instanceof PhotoError ? cause : new PhotoError("retryError");
      const retry = () => {
        if (!active.current) start(task, pending);
      };
      setState(error.canRetry ? { kind: "error", error, retry } : { kind: "error", error });
      if (!error.canRetry) setBusy(false);
    } finally {
      if (!signal.aborted) active.current = null;
    }
  }

  function start(task: PhotoTask, pending: PendingStep) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setState({ kind: pending });
    void runTask(task, pending, controller.signal);
  }

  function choose(file: File) {
    if (!scope) return;
    const attempt = { scope, file, key: crypto.randomUUID() };
    start(
      async (signal) => ({ kind: "crop", photo: await preparePhoto(attempt, signal) }),
      "preparing",
    );
  }

  function apply(crop: Crop) {
    if (!scope || state.kind !== "crop" || active.current) return;
    const attempt = { scope, mediaId: state.photo.mediaId, crop, key: crypto.randomUUID() };
    start(
      async (signal) => ({ kind: "ready", photo: await finishPhoto(attempt, signal) }),
      "processing",
    );
  }

  function remove() {
    cancel();
    setSelected(undefined);
    callbacks.current.onChange(null);
  }

  return { state, selected, choose, apply, cancel, remove };
}
