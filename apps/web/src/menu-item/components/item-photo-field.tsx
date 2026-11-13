"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { PhotoUploader } from "../../media/components/photo-uploader";
import { usePhotoUpload } from "../../media/use-photo-upload";

export interface ItemPhotoFieldProps {
  readonly merchantId: string;
  readonly sessionId: string;
  readonly photoId: string | null;
  readonly isDisabled: boolean;
  readonly onPhotoChange: (photoId: string | null) => void;
}

export function ItemPhotoField({
  merchantId,
  sessionId,
  photoId,
  isDisabled,
  onPhotoChange,
}: ItemPhotoFieldProps) {
  const translate = useTranslations("menuItem");
  const { state, controller } = usePhotoUpload({
    target: { kind: "item", merchantId },
    sessionId,
  });
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
    <fieldset disabled={isDisabled} className="menu-item-fields">
      <legend>{translate("photo")}</legend>
      {photoId !== null && state.kind === "idle" ? (
        <div className="menu-item-actions">
          <p>{translate("photoAttached")}</p>
          <button
            className="menu-item-secondary"
            type="button"
            data-item-photo-remove=""
            onClick={() => {
              onPhotoChange(null);
            }}
          >
            {translate("removePhoto")}
          </button>
        </div>
      ) : null}
      <PhotoUploader
        kind="item"
        state={state}
        onChoose={controller.choose}
        onCropChange={controller.adjust}
        onConfirm={controller.confirm}
        onReset={controller.reset}
      />
    </fieldset>
  );
}
