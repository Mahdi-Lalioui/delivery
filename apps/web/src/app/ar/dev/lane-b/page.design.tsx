import { GalleryPage, galleryMetadata } from "../../../../admin/gallery/gallery-page";

export const metadata = galleryMetadata;

export default async function ArabicLaneBGallery({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string | string[] }>;
}) {
  return <GalleryPage locale="ar" initialScreen={(await searchParams).screen} />;
}
