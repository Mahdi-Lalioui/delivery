"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { CropControls } from "./crop-controls";
import type { PhotoKind, PhotoScope } from "./media-photo-http";
import { SelectedPhotoPreview } from "./selected-photo-preview";
import { usePhotoUpload } from "./use-photo-upload";
import "./media-photo.css";

interface MediaPhotoFieldProps {
  kind: PhotoKind;
  merchantId?: string | undefined;
  expectedSessionId: string | undefined;
  mediaId: string | null | undefined;
  onChange: (mediaId: string | null) => void;
  onBusyChange?: ((busy: boolean) => void) | undefined;
  disabled?: boolean;
}

const acceptedFiles = "image/jpeg,image/png,image/heic,image/webp,.jpg,.jpeg,.png,.heic,.webp";

function PhotoPicker({
  replacing,
  onChoose,
}: {
  replacing: boolean;
  onChoose: (file: File) => void;
}) {
  const t = useTranslations("mediaPhoto");
  const id = useId();
  return (
    <>
      <p className="media-photo-hint" id={`${id}-hint`}>
        {t("guide")}
      </p>
      <label htmlFor={id}>{t(replacing ? "replace" : "choose")}</label>
      <input
        id={id}
        type="file"
        accept={acceptedFiles}
        aria-describedby={`${id}-hint ${id}-formats`}
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0);
          event.currentTarget.value = "";
          if (file) onChoose(file);
        }}
      />
      <p className="media-photo-hint" id={`${id}-formats`}>
        {t("formats")}
      </p>
    </>
  );
}

type Upload = ReturnType<typeof usePhotoUpload>;

function PhotoProgress({ kind, upload }: { kind: PhotoKind; upload: Upload }) {
  const t = useTranslations("mediaPhoto");
  const { state } = upload;
  const pending = state.kind === "preparing" || state.kind === "processing";
  return (
    <>
      <div className="media-photo-status" role="status">
        {pending ? t(state.kind) : null}
      </div>
      {state.kind === "crop" && (
        <CropControls
          key={state.photo.mediaId}
          kind={kind}
          photo={state.photo}
          onApply={upload.apply}
        />
      )}
      {state.kind === "error" && (
        <p className="media-photo-error" role="alert">
          {t(state.error.code)}
        </p>
      )}
    </>
  );
}

function PhotoActions({ upload, hasSelected }: { upload: Upload; hasSelected: boolean }) {
  const t = useTranslations("mediaPhoto");
  const { state } = upload;
  const retry = state.kind === "error" ? state.retry : undefined;
  const canCancel =
    state.kind === "preparing" ||
    state.kind === "processing" ||
    state.kind === "crop" ||
    Boolean(retry);
  if (!canCancel && !hasSelected) return null;
  return (
    <div className="media-photo-actions">
      {retry && (
        <button type="button" onClick={retry}>
          {t("retry")}
        </button>
      )}
      {canCancel && (
        <button type="button" onClick={upload.cancel}>
          {t("cancel")}
        </button>
      )}
      {hasSelected && (
        <button type="button" onClick={upload.remove}>
          {t("remove")}
        </button>
      )}
    </div>
  );
}

function getScope({
  kind,
  merchantId,
  expectedSessionId,
}: MediaPhotoFieldProps): PhotoScope | null {
  if (!expectedSessionId || (kind === "item" && !merchantId)) return null;
  return { kind, merchantId, sessionId: expectedSessionId };
}

function ScopedPhotoField(props: MediaPhotoFieldProps) {
  const t = useTranslations("mediaPhoto");
  const { kind, mediaId, onChange, onBusyChange, disabled } = props;
  const scope = getScope(props);
  const upload = usePhotoUpload({ scope, onChange, onBusyChange });
  return (
    <fieldset className="media-photo-field" disabled={disabled || !scope}>
      <legend>{t("title")}</legend>
      {mediaId && (
        <SelectedPhotoPreview
          key={mediaId}
          scope={scope}
          mediaId={mediaId}
          current={upload.selected}
        />
      )}
      <PhotoPicker replacing={Boolean(mediaId)} onChoose={upload.choose} />
      <PhotoProgress kind={kind} upload={upload} />
      <PhotoActions upload={upload} hasSelected={Boolean(mediaId)} />
    </fieldset>
  );
}

export function MediaPhotoField(props: MediaPhotoFieldProps) {
  const scopeKey = JSON.stringify([props.kind, props.merchantId, props.expectedSessionId]);
  return <ScopedPhotoField key={scopeKey} {...props} />;
}
