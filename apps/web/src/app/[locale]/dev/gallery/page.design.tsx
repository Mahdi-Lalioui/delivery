import { GalleryPage, galleryMetadata } from "../../../../admin/gallery/gallery-page";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";

export const metadata = galleryMetadata;

export default async function LatinGallery(
  props: LatinPageProps & { searchParams: Promise<{ screen?: string | string[] }> },
) {
  return (
    <GalleryPage
      locale={await requireLatinLocale(props)}
      initialScreen={(await props.searchParams).screen}
    />
  );
}
