import { useTranslations } from "next-intl";
import { MediaPhotoField } from "../../media-photo/media-photo-field";
import type { ProfilePhotos, ProfilePhotosAccess } from "../merchant-profile-photos-http";
import { useProfilePhotos } from "../use-profile-photos";

const slots = [
  { kind: "cover", field: "coverPhotoId", description: "coverDescription", empty: "emptyCover" },
  { kind: "logo", field: "logoPhotoId", description: "logoDescription", empty: "emptyLogo" },
] as const;

function EmptyPhoto({ kind, text }: { kind: "cover" | "logo"; text: string }) {
  return (
    <div className="profile-photos-empty" data-kind={kind}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <circle cx="9" cy="9.5" r="1.5" />
        <path d="m4 16 4-3 3 2 4.5-4 5 5" />
      </svg>
      <p>{text}</p>
    </div>
  );
}

const feedbackMessages = {
  error: "saveError",
  "photos-unavailable": "photosUnavailable",
  "revision-conflict": "revisionConflict",
} as const;

interface Props {
  merchantId: string;
  initial: ProfilePhotos;
  onAccessChanged: (kind: ProfilePhotosAccess) => void;
  onReload: () => void;
}

export function MerchantProfilePhotosForm({
  merchantId,
  initial,
  onAccessChanged,
  onReload,
}: Props) {
  const t = useTranslations("merchantProfilePhotos");
  const { draft, pending, feedback, canSave, blocked, onBusy, update, submit } = useProfilePhotos({
    merchantId,
    initial,
    onAccessChanged,
  });
  return (
    <form
      className="profile-photos-form"
      method="post"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="profile-photos-name">
        <bdi>{initial.restaurantName}</bdi>
      </p>
      <div className="profile-photos-grid">
        {slots.map(({ kind, field, description, empty }) => (
          <div className="profile-photos-slot" data-kind={kind} key={kind}>
            <MediaPhotoField
              kind={kind}
              merchantId={merchantId}
              expectedSessionId={initial.sessionId}
              mediaId={draft[field]}
              title={t(kind)}
              description={t(description)}
              empty={<EmptyPhoto kind={kind} text={t(empty)} />}
              disabled={blocked}
              onChange={(mediaId) => {
                update(field, mediaId);
              }}
              onBusyChange={(busy) => {
                onBusy(field, busy);
              }}
            />
          </div>
        ))}
      </div>
      <div className="profile-photos-actions">
        {feedback && feedback !== "saved" && (
          <p className="profile-photos-error" role="alert">
            {t(feedbackMessages[feedback])}
          </p>
        )}
        {feedback === "revision-conflict" ? (
          <button type="button" className="profile-photos-secondary" onClick={onReload}>
            {t("reload")}
          </button>
        ) : (
          <button type="submit" className="profile-photos-primary" disabled={!canSave}>
            {t(pending ? "saving" : "save")}
          </button>
        )}
        <p className="profile-photos-status" role="status">
          {feedback === "saved" ? t("saved") : null}
        </p>
      </div>
    </form>
  );
}
