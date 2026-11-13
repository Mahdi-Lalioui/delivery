import { thumbHashToDataURL } from "thumbhash";
import type { MenuPreview } from "../menu-preview-http";

type PublishedPhoto = NonNullable<MenuPreview["categories"][number]["items"][number]["photo"]>;
type Variant = PublishedPhoto["variants"][number];

const fallbackWidth = 640;
// The preview card is at most about 40rem wide; phones use the full viewport.
const displaySizes = "(min-width: 48rem) 40rem, 100vw";

function sourceSet(variants: readonly Variant[]): string {
  return [...variants]
    .sort((first, second) => first.width - second.width)
    .map(({ url, width }) => `${url} ${width.toString()}w`)
    .join(", ");
}

function largest(variants: readonly Variant[]): Variant | undefined {
  return variants.reduce<Variant | undefined>(
    (best, variant) => (best === undefined || variant.width > best.width ? variant : best),
    undefined,
  );
}

function placeholderUrl(thumbhash: string): string {
  // Runs in the browser too, where `Buffer` does not exist.
  return thumbHashToDataURL(Uint8Array.from(atob(thumbhash), (byte) => byte.charCodeAt(0)));
}

/** A decorative dish photo: the item name is the heading right beside it. */
export function MenuPreviewPhoto({ photo }: { photo: PublishedPhoto }) {
  const avif = photo.variants.filter(({ format }) => format === "avif");
  const webp = photo.variants.filter(({ format }) => format === "webp");
  const fallback = webp.find(({ width }) => width === fallbackWidth) ?? largest(webp);
  const size = largest(webp);
  if (!fallback || !size) return null;
  // The ThumbHash paints under the photo until it loads (DESIGN §6); both are decorative.
  return (
    <div className="menu-preview-photo">
      <img
        className="menu-preview-placeholder"
        src={placeholderUrl(photo.thumbhash)}
        width={size.width}
        height={size.height}
        alt=""
        aria-hidden="true"
      />
      <picture>
        <source type="image/avif" srcSet={sourceSet(avif)} sizes={displaySizes} />
        <source type="image/webp" srcSet={sourceSet(webp)} sizes={displaySizes} />
        <img
          src={fallback.url}
          width={size.width}
          height={size.height}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </picture>
    </div>
  );
}
