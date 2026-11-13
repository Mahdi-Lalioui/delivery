"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPhotoController, type PhotoUploadOptions } from "./photo-controller";
import { initialPhotoState, type PhotoState } from "./photo-state";

function getServerSnapshot(): PhotoState {
  return initialPhotoState;
}

/** One controller per mount; key the caller by session so a new session starts afresh. */
export function usePhotoUpload(options: PhotoUploadOptions) {
  const [controller] = useState(() => createPhotoController(options));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    getServerSnapshot,
  );
  useEffect(() => controller.dispose, [controller]);
  return { state, controller };
}
