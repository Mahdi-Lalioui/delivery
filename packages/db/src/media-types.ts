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

export interface MediaStatus {
  readonly mediaId: string;
  readonly sessionId: string;
  readonly kind: MediaKind;
  readonly status: "awaiting_upload" | "preparing";
}

export type MediaReservationResult =
  | { readonly kind: "created" | "replayed"; readonly media: MediaStatus }
  | { readonly kind: "not_found" | "idempotency_conflict" };

export type MediaAdoptionResult =
  | { readonly kind: "accepted" | "replayed"; readonly media: MediaStatus }
  | { readonly kind: "not_found" | "content_mismatch" | "upload_conflict" };
