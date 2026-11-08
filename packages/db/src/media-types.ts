export type MediaKind = "application" | "cover" | "item" | "logo";

export interface MediaUploadDescriptor {
  readonly contentType: "image/jpeg" | "image/png" | "image/heic" | "image/webp";
  readonly bytes: number;
}

type ReservationInput = MediaUploadDescriptor &
  (
    | { readonly kind: "application" }
    | { readonly kind: Exclude<MediaKind, "application">; readonly merchantId: string }
  );

export interface MediaSessionScope {
  readonly accountId: string;
  readonly sessionId: string;
  readonly now: Date;
}

export interface MediaScope extends MediaSessionScope {
  readonly mediaId: string;
}

export interface MediaReservationRequest extends MediaSessionScope {
  readonly input: ReservationInput;
  readonly idempotencyKeyHash: Uint8Array;
  readonly requestHash: Uint8Array;
}

interface MediaCropInput {
  readonly focalX: number;
  readonly focalY: number;
  readonly zoomPercent: number;
}

export interface MediaCropRequest extends MediaScope {
  readonly input: MediaCropInput;
  readonly idempotencyKeyHash: Uint8Array;
  readonly requestHash: Uint8Array;
}

export interface MediaAdoptionRequest extends MediaScope, MediaUploadDescriptor {
  readonly quarantineKey: string;
  readonly digest: Uint8Array;
}

type MediaRejection = {
  readonly status: "rejected";
  readonly reason: "content_type_mismatch" | "invalid_image" | "image_too_large";
};

type MediaPreview = {
  readonly status: "awaiting_crop";
  readonly width: number;
  readonly height: number;
};

interface MediaVariant {
  readonly format: "avif" | "webp";
  readonly width: 160 | 320 | 640 | 960 | 1280;
  readonly height: number;
  readonly bytes: number;
}

export type MediaStoredVariant = MediaVariant & { readonly key: string };

type MediaReady<Variant extends MediaVariant> = {
  readonly status: "ready";
  readonly variants: readonly Variant[];
  readonly thumbhash: string;
};

export type MediaState<Variant extends MediaVariant = MediaVariant> =
  | { readonly status: "awaiting_upload" | "preparing" | "processing" }
  | MediaPreview
  | MediaRejection
  | MediaReady<Variant>;

export type MediaStatus<Variant extends MediaVariant = MediaVariant> = MediaState<Variant> & {
  readonly mediaId: string;
  readonly sessionId: string;
  readonly kind: MediaKind;
};

export type MediaVariantScope = MediaScope & Pick<MediaVariant, "format" | "width">;

export type MediaCropWork = {
  readonly quarantineKey: string;
  readonly previewKey: string;
} & (
  | ({
      readonly status: "processing";
      readonly kind: MediaKind;
      readonly crop: MediaCropInput;
      readonly digest: Uint8Array;
    } & MediaUploadDescriptor)
  | { readonly status: "ready" }
);

export interface MediaCropCompletion {
  readonly mediaId: string;
  readonly quarantineKey: string;
  readonly result: MediaReady<MediaStoredVariant>;
}

export type MediaPreparationSource = { readonly quarantineKey: string } & (
  | ({ readonly status: "preparing"; readonly digest: Uint8Array } & MediaUploadDescriptor)
  | { readonly status: "rejected" }
);

export interface MediaPreparationCompletion {
  readonly mediaId: string;
  readonly quarantineKey: string;
  readonly result: (MediaPreview & { readonly previewKey: string }) | MediaRejection;
}

export type MediaReservationResult =
  | { readonly kind: "created" | "replayed"; readonly media: MediaStatus }
  | { readonly kind: "not_found" | "idempotency_conflict" };

export type MediaAdoptionResult =
  | { readonly kind: "accepted" | "replayed"; readonly media: MediaStatus }
  | { readonly kind: "not_found" | "content_mismatch" | "upload_conflict" };

export type MediaCropResult =
  | { readonly kind: "accepted" | "replayed"; readonly media: MediaStatus }
  | { readonly kind: "not_found" | "idempotency_conflict" | "crop_conflict" };
