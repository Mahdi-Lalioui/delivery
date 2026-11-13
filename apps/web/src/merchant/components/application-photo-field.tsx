"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { PhotoUploader } from "../../media/components/photo-uploader";
import { usePhotoUpload } from "../../media/use-photo-upload";

export interface ApplicationPhotoFieldProps {
  readonly sessionId: string;
  readonly photoId: string | null;
  readonly onPhotoChange: (photoId: string | null) => void;
}

/** One optional, private 16:9 photo of the restaurant for the admin review (D-007). */
export function ApplicationPhotoField({
  sessionId,
  photoId,
  onPhotoChange,
}: ApplicationPhotoFieldProps) {
  const translate = useTranslations("merchant");
  const { state, controller } = usePhotoUpload({ target: { kind: "application" }, sessionId });
  // The latest callback, so a parent re-render cannot re-announce the same ready photo.
  const announce = useRef(onPhotoChange);
  useEffect(() => {
    announce.current = onPhotoChange;
  });
  const readyId = state.kind === "ready" ? state.photo.mediaId : undefined;
  useEffect(() => {
    if (readyId !== undefined) announce.current(readyId);
  }, [readyId]);

  return (
    <fieldset className="merchant-form-fields">
      <legend>{translate("photo")}</legend>
      {photoId !== null && state.kind === "idle" ? (
        <div>
          <p>{translate("photoAttached")}</p>
          <button
            className="merchant-secondary"
            type="button"
            data-application-photo-remove=""
            onClick={() => {
              onPhotoChange(null);
            }}
          >
            {translate("removePhoto")}
          </button>
        </div>
      ) : null}
      <PhotoUploader
        kind="application"
        state={state}
        onChoose={controller.choose}
        onCropChange={controller.adjust}
        onConfirm={controller.confirm}
        onReset={controller.reset}
      />
    </fieldset>
  );
}
