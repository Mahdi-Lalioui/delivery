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

export type MediaState =
  { readonly status: "awaiting_upload" | "preparing" } | MediaPreview | MediaRejection;

export type MediaStatus = MediaState & {
  readonly mediaId: string;
  readonly sessionId: string;
  readonly kind: MediaKind;
};

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
