import type { photoRatios } from "@zaafran/contracts/media";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { photoPreviewUrl } from "../photo-controller";
import type { PhotoState } from "../photo-state";
import type { PhotoCrop } from "../media-http";
import { PhotoCropper } from "./photo-cropper";
import "./photo-uploader.css";

type Failure = NonNullable<Extract<PhotoState, { kind: "idle" | "cropping" }>["failure"]>;
type FailureMessage =
  | "tooLarge"
  | "unsupportedType"
  | "invalidImage"
  | "imageTooLarge"
  | "timedOut"
  | "rateLimited"
  | "signInRequired"
  | "forbidden"
  | "sessionChanged"
  | "error";

export interface PhotoUploaderProps {
  readonly kind: keyof typeof photoRatios;
  readonly state: PhotoState;
  readonly onChoose: (file: File) => void;
  readonly onCropChange: (crop: PhotoCrop) => void;
  readonly onConfirm: () => void;
  readonly onReset: () => void;
}

const acceptedTypes = "image/jpeg,image/png,image/heic,image/webp";
const guideTips = ["guideLight", "guideAngle", "guideNoText", "guideOwn"] as const;
const rejectionMessages = {
  content_type_mismatch: "invalidImage",
  invalid_image: "invalidImage",
  image_too_large: "imageTooLarge",
} as const satisfies Record<Extract<Failure, { kind: "rejected" }>["reason"], FailureMessage>;
const failureMessages: Partial<Record<Failure["kind"], FailureMessage>> = {
  "too-large": "tooLarge",
  "unsupported-type": "unsupportedType",
  "content-mismatch": "invalidImage",
  "timed-out": "timedOut",
  "rate-limited": "rateLimited",
  "sign-in": "signInRequired",
  forbidden: "forbidden",
  "session-changed": "sessionChanged",
};

function describeFailure(failure: Failure): FailureMessage {
  if (failure.kind === "rejected") return rejectionMessages[failure.reason];
  return failureMessages[failure.kind] ?? "error";
}

function FailureAlert({ failure }: { failure: Failure | undefined }) {
  const translate = useTranslations("photoUpload");
  if (!failure) return null;
  return (
    <p className="photo-upload-error" role="alert">
      {translate(describeFailure(failure))}
    </p>
  );
}

function PhotoPicker({ onChoose }: { onChoose: (file: File) => void }) {
  const translate = useTranslations("photoUpload");
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.item(0);
    event.currentTarget.value = "";
    if (file) onChoose(file);
  };
  return (
    <div className="photo-upload-picker">
      <p className="photo-upload-guide-title">{translate("guideTitle")}</p>
      <ul className="photo-upload-guide">
        {guideTips.map((tip) => (
          <li key={tip}>{translate(tip)}</li>
        ))}
      </ul>
      <label className="menu-item-secondary photo-upload-choose">
        {translate("choose")}
        <input type="file" accept={acceptedTypes} data-photo-file="" onChange={onChange} />
      </label>
      <p className="photo-upload-limits">{translate("limits")}</p>
    </div>
  );
}

function ChooseAnother({ onReset }: { onReset: () => void }) {
  const translate = useTranslations("photoUpload");
  return (
    <button className="menu-item-secondary" type="button" data-photo-reset="" onClick={onReset}>
      {translate("chooseAnother")}
    </button>
  );
}

function CropStep(
  props: PhotoUploaderProps & { state: Extract<PhotoState, { kind: "cropping" | "saving" }> },
) {
  const { state } = props;
  const { photo } = state;
  return (
    <>
      <PhotoCropper
        kind={props.kind}
        preview={{ url: photoPreviewUrl(photo.mediaId), width: photo.width, height: photo.height }}
        crop={state.crop}
        isSaving={state.kind === "saving"}
        onCropChange={props.onCropChange}
        onConfirm={props.onConfirm}
      />
      <FailureAlert failure={state.kind === "cropping" ? state.failure : undefined} />
      <ChooseAnother onReset={props.onReset} />
    </>
  );
}

export function PhotoUploader(props: PhotoUploaderProps) {
  const translate = useTranslations("photoUpload");
  const { state } = props;
  switch (state.kind) {
    case "idle":
      return (
        <div className="photo-upload">
          <PhotoPicker onChoose={props.onChoose} />
          <FailureAlert failure={state.failure} />
        </div>
      );
    case "uploading":
      return (
        <p className="photo-upload" role="status">
          {translate("uploading")}
        </p>
      );
    case "cropping":
    case "saving":
      return (
        <div className="photo-upload">
          <CropStep {...props} state={state} />
        </div>
      );
    case "ready":
      return (
        <div className="photo-upload">
          <p role="status">{translate("ready")}</p>
          <ChooseAnother onReset={props.onReset} />
        </div>
      );
  }
}
