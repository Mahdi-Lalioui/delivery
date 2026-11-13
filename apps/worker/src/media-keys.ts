// The web server publishes only `media/`; previews and application photos stay private (§16, D-007).
type MediaKind = "application" | "cover" | "item" | "logo";

interface VariantKeyInput {
  readonly mediaId: string;
  readonly kind: MediaKind;
  readonly width: number;
  readonly format: "avif" | "webp";
}

export function previewStorageKey(mediaId: string): string {
  return `private/${mediaId}/preview.webp`;
}

export function variantStorageKey({ mediaId, kind, width, format }: VariantKeyInput): string {
  const prefix = kind === "application" ? "private" : "media";
  return `${prefix}/${mediaId}/${width.toString()}.${format}`;
}
