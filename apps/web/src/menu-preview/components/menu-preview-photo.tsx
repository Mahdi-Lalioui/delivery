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

/** A decorative dish photo: the item name is the heading right beside it. */
export function MenuPreviewPhoto({ photo }: { photo: PublishedPhoto }) {
  const avif = photo.variants.filter(({ format }) => format === "avif");
  const webp = photo.variants.filter(({ format }) => format === "webp");
  const fallback = webp.find(({ width }) => width === fallbackWidth) ?? largest(webp);
  const size = largest(webp);
  if (!fallback || !size) return null;
  return (
    <picture className="menu-preview-photo">
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
  );
}
