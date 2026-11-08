import { useLayoutEffect, useRef, useState } from "react";
import {
  makeProfilePhotosAttempt,
  samePhotoIds,
  saveProfilePhotos,
  type PhotoIds,
  type ProfilePhotos,
  type ProfilePhotosAccess,
  type SaveResult,
} from "./merchant-profile-photos-http";

type Feedback = "saved" | "revision-conflict" | "photos-unavailable" | "error";

interface Options {
  merchantId: string;
  initial: ProfilePhotos;
  onAccessChanged: (kind: ProfilePhotosAccess) => void;
}

export function useProfilePhotos({ merchantId, initial, onAccessChanged }: Options) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<PhotoIds>({
    coverPhotoId: initial.coverPhotoId,
    logoPhotoId: initial.logoPhotoId,
  });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const busy = useRef(new Set<keyof PhotoIds>());
  const [uploading, setUploading] = useState(false);
  const attempt = useRef<ReturnType<typeof makeProfilePhotosAttempt> | undefined>(undefined);
  const request = useRef<AbortController | null>(null);

  useLayoutEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  const blocked = pending || feedback === "revision-conflict";
  const canSave = !blocked && !uploading && !samePhotoIds(saved, draft);

  function onBusy(field: keyof PhotoIds, value: boolean) {
    if (value) busy.current.add(field);
    else busy.current.delete(field);
    setUploading(busy.current.size > 0);
  }

  function update(field: keyof PhotoIds, value: string | null) {
    if (blocked || request.current) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setFeedback(undefined);
  }

  async function submit() {
    if (!canSave || busy.current.size > 0 || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const current = makeProfilePhotosAttempt(saved, draft, attempt.current);
    setPending(true);
    setFeedback(undefined);

    const result = await saveProfilePhotos({
      merchantId,
      attempt: current,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    request.current = null;
    setPending(false);
    finishSave(result, current);
  }

  function finishSave(result: SaveResult, current: ReturnType<typeof makeProfilePhotosAttempt>) {
    attempt.current = result.kind === "error" && result.retry ? current : undefined;
    switch (result.kind) {
      case "saved":
        setSaved(result.data);
        setFeedback("saved");
        break;
      case "photos-unavailable":
      case "revision-conflict":
      case "error":
        setFeedback(result.kind);
        break;
      default:
        onAccessChanged(result.kind);
    }
  }

  return { draft, pending, feedback, canSave, blocked, onBusy, update, submit };
}
