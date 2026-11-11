import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readSelectedPhoto, type PhotoScope, type SelectedPhoto } from "./media-photo-http";
import { usePhotoUrl } from "./use-photo-url";

interface SelectedPhotoPreviewProps {
  scope: PhotoScope | null;
  mediaId: string;
  current: SelectedPhoto | undefined;
}

function useSelectedPhoto({ scope, mediaId, current }: SelectedPhotoPreviewProps) {
  const [loaded, setLoaded] = useState<SelectedPhoto>();
  const [failed, setFailed] = useState(false);
  const photo = current?.mediaId === mediaId ? current : loaded;
  const kind = scope?.kind;
  const merchantId = scope?.merchantId;
  const orderId = scope?.orderId;
  const sessionId = scope?.sessionId;

  useEffect(() => {
    if (current?.mediaId === mediaId || !kind || !sessionId) return;
    const controller = new AbortController();
    const reference = { scope: { kind, merchantId, orderId, sessionId }, mediaId };
    void readSelectedPhoto(reference, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setLoaded(value);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => {
      controller.abort();
    };
  }, [current, kind, mediaId, merchantId, orderId, sessionId]);

  return { photo, failed: failed || !sessionId, setFailed };
}

export function SelectedPhotoPreview(props: SelectedPhotoPreviewProps) {
  const t = useTranslations("mediaPhoto");
  const { photo, failed, setFailed } = useSelectedPhoto(props);
  const url = usePhotoUrl(photo?.blob);

  if (failed) {
    return (
      <p className="media-photo-hint" role="status">
        {t("previewUnavailable")}
      </p>
    );
  }

  if (!url || !photo)
    return (
      <p className="media-photo-hint" role="status">
        {t("loadingPreview")}
      </p>
    );
  return (
    // The private WebP is already optimized by the worker and lives in this tab.
    <img
      className="media-photo-preview"
      src={url}
      alt={t("selectedPreview")}
      width={photo.width}
      height={photo.height}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}
