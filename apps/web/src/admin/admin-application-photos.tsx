import { useTranslations } from "next-intl";

// Application photos are private (D-007): the admin-only API route streams the 16:9 WebP variant.
const displayWidth = 640;
const displayHeight = 360;
const largeWidth = 1280;

function photoUrl(merchantId: string, photoId: string, width: number): string {
  return `/v1/admin/merchant-applications/${merchantId}/photos/${photoId}/${String(width)}`;
}

export function AdminApplicationPhotos({
  merchantId,
  photoIds,
}: {
  merchantId: string;
  photoIds: readonly string[];
}) {
  const translate = useTranslations("adminMerchant");
  if (photoIds.length === 0) return <>{translate("notProvided")}</>;

  return (
    <ul className="admin-merchant-photos">
      {photoIds.map((photoId, index) => (
        <li key={photoId}>
          <img
            src={photoUrl(merchantId, photoId, displayWidth)}
            srcSet={
              `${photoUrl(merchantId, photoId, displayWidth)} ${String(displayWidth)}w, ` +
              `${photoUrl(merchantId, photoId, largeWidth)} ${String(largeWidth)}w`
            }
            sizes="(min-width: 80rem) 40rem, 100vw"
            alt={translate("photoAlt", { position: index + 1 })}
            width={displayWidth}
            height={displayHeight}
            loading="lazy"
            decoding="async"
          />
        </li>
      ))}
    </ul>
  );
}
