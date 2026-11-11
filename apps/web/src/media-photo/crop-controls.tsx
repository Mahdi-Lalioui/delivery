import { photoRatios } from "@zaafran/contracts/media";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cropRegion } from "./crop-region";
import type { Crop, PhotoImage, PhotoKind } from "./media-photo-http";
import { usePhotoUrl } from "./use-photo-url";

const initialCrop = { focalX: 5_000, focalY: 5_000, zoomPercent: 100 };
const sliderFields = [
  { key: "focalX", label: "focalX", min: 0, max: 10_000, step: 100 },
  { key: "focalY", label: "focalY", min: 0, max: 10_000, step: 100 },
  { key: "zoomPercent", label: "zoom", min: 100, max: 400, step: 5 },
] as const;

interface CropControlsProps {
  kind: PhotoKind;
  photo: PhotoImage;
  onApply: (crop: Crop) => void;
}

export function CropControls({ kind, photo, onApply }: CropControlsProps) {
  const t = useTranslations("mediaPhoto");
  const [crop, setCrop] = useState<Crop>(initialCrop);
  const [image, setImage] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = usePhotoUrl(photo.blob);
  const ratio = photoRatios[kind];
  const width = 640;
  const height = (width * ratio.height) / ratio.width;

  useEffect(() => {
    if (!image) return;
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const region = cropRegion(photo, kind, crop);
    context.clearRect(0, 0, width, height);
    context.drawImage(
      image,
      region.left,
      region.top,
      region.width,
      region.height,
      0,
      0,
      width,
      height,
    );
  }, [crop, height, image, kind, photo]);

  return (
    <fieldset className="media-photo-crop">
      <legend>{t("cropTitle")}</legend>
      <p className="media-photo-hint">
        {t("cropHint", { width: ratio.width, height: ratio.height })}
      </p>
      {url && (
        // The private WebP is already optimized by the worker and lives in this tab.
        <img
          hidden
          alt=""
          src={url}
          width={photo.width}
          height={photo.height}
          onLoad={(event) => {
            setImage(event.currentTarget);
          }}
          onError={() => {
            setFailed(true);
          }}
        />
      )}
      <canvas
        ref={canvas}
        className="media-photo-preview"
        role="img"
        aria-label={t("cropPreview")}
        width={width}
        height={height}
      />
      {failed && <p role="alert">{t("previewUnavailable")}</p>}
      {sliderFields.map(({ key, label, ...limits }) => (
        <label className="media-photo-slider" key={key}>
          {t(label)}
          <input
            type="range"
            dir="ltr"
            {...limits}
            value={crop[key]}
            onChange={(event) => {
              setCrop({ ...crop, [key]: event.currentTarget.valueAsNumber });
            }}
          />
        </label>
      ))}
      <button
        type="button"
        className="media-photo-apply"
        disabled={!image || failed}
        onClick={() => {
          onApply(crop);
        }}
      >
        {t("applyCrop")}
      </button>
    </fieldset>
  );
}
