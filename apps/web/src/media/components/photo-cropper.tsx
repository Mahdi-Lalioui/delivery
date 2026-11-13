import type { photoRatios } from "@zaafran/contracts/media";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId } from "react";
import { cropFrame, nudgeCrop, zoomMaximum, zoomMinimum, type CropFrame } from "../crop-editor";
import type { PhotoCrop } from "../media-http";
import "./photo-cropper.css";

export interface PhotoCropperProps {
  readonly kind: keyof typeof photoRatios;
  /** The private `awaiting_crop` preview and its pixel size from the status read. */
  readonly preview: { readonly url: string; readonly width: number; readonly height: number };
  readonly crop: PhotoCrop;
  readonly isSaving: boolean;
  readonly onCropChange: (crop: PhotoCrop) => void;
  readonly onConfirm: () => void;
}

function CropOverlay({ frame }: { frame: CropFrame }) {
  const { startPercent: x, topPercent: y, widthPercent: width, heightPercent: height } = frame;
  const hole = `M${x.toString()} ${y.toString()}h${width.toString()}v${height.toString()}h${(-width).toString()}Z`;
  return (
    <svg
      className="photo-crop-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="photo-crop-scrim" fillRule="evenodd" d={`M0 0H100V100H0Z${hole}`} />
      <rect
        className="photo-crop-frame"
        data-crop-frame=""
        x={x}
        y={y}
        width={width}
        height={height}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CropStage({ props, describedBy }: { props: PhotoCropperProps; describedBy: string }) {
  const translate = useTranslations("photoCrop");
  const { preview, crop, kind, isSaving, onCropChange } = props;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nudgeCrop(crop, { key: event.key, isLarge: event.shiftKey });
    if (!next) return;
    event.preventDefault();
    onCropChange(next);
  };
  return (
    <div
      className="photo-crop-stage"
      dir="ltr"
      data-crop-stage=""
      tabIndex={isSaving ? -1 : 0}
      role="group"
      aria-label={translate("title")}
      aria-describedby={describedBy}
      onKeyDown={isSaving ? undefined : onKeyDown}
    >
      <img
        className="photo-crop-image"
        src={preview.url}
        width={preview.width}
        height={preview.height}
        alt={translate("previewAlt")}
        draggable={false}
      />
      <CropOverlay frame={cropFrame(preview, kind, crop)} />
    </div>
  );
}

function CropControls({ props }: { props: PhotoCropperProps }) {
  const translate = useTranslations("photoCrop");
  const { crop, onCropChange } = props;
  const press = (key: string) => {
    const next = nudgeCrop(crop, { key, isLarge: false });
    if (next) onCropChange(next);
  };
  return (
    <div className="photo-crop-controls">
      <button
        className="menu-item-secondary"
        type="button"
        disabled={crop.zoomPercent <= zoomMinimum}
        data-crop-zoom-out=""
        onClick={() => {
          press("-");
        }}
      >
        {translate("zoomOut")}
      </button>
      <button
        className="menu-item-secondary"
        type="button"
        disabled={crop.zoomPercent >= zoomMaximum}
        data-crop-zoom-in=""
        onClick={() => {
          press("+");
        }}
      >
        {translate("zoomIn")}
      </button>
      <button
        className="menu-item-secondary"
        type="button"
        onClick={() => {
          press("Home");
        }}
      >
        {translate("recentre")}
      </button>
      <button
        className="menu-item-primary"
        type="button"
        data-crop-confirm=""
        onClick={props.onConfirm}
      >
        {translate("confirm")}
      </button>
    </div>
  );
}

export function PhotoCropper(props: PhotoCropperProps) {
  const translate = useTranslations("photoCrop");
  const instructionsId = useId();
  const { crop, isSaving } = props;
  return (
    <fieldset disabled={isSaving} className="photo-crop">
      <legend>{translate("title")}</legend>
      <p id={instructionsId} className="photo-crop-instructions">
        {translate("instructions")}
      </p>
      <CropStage props={props} describedBy={instructionsId} />
      <p className="photo-crop-position" role="status">
        {isSaving
          ? translate("saving")
          : translate("position", {
              x: crop.focalX / 100,
              y: crop.focalY / 100,
              zoom: crop.zoomPercent,
            })}
      </p>
      <CropControls props={props} />
    </fieldset>
  );
}
