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

export interface MediaIdentity {
  readonly mediaId: string;
  readonly sessionId: string;
  readonly kind: MediaKind;
}

export interface MediaVariant {
  readonly format: "avif" | "webp";
  readonly width: 160 | 320 | 640 | 960 | 1280;
  readonly height: number;
  readonly bytes: number;
}

type MediaState =
  | { readonly status: "awaiting_upload" | "preparing" | "processing" }
  | { readonly status: "awaiting_crop"; readonly width: number; readonly height: number }
  | {
      readonly status: "ready";
      readonly variants: MediaVariant[];
      readonly thumbhash: string;
    }
  | {
      readonly status: "rejected";
      readonly reason: "content_type_mismatch" | "invalid_image" | "image_too_large";
    };

export type MediaStatus = MediaIdentity & MediaState;

export type MediaReservationResult<Media = MediaStatus> =
  | { readonly kind: "created" | "replayed"; readonly media: Media }
  | { readonly kind: "not_found" | "idempotency_conflict" };

export type MediaAdoptionResult<Media = MediaStatus> =
  | { readonly kind: "accepted" | "replayed"; readonly media: Media }
  | { readonly kind: "not_found" | "content_mismatch" | "upload_conflict" };
