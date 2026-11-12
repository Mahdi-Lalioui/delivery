import { claimDeliveryProofMedia, finishDeliveryProofMedia } from "./delivery-proof-retention.js";
import type { DatabaseConnection } from "./database.js";
import { mediaStatus, readVisibleMedia } from "./media-access.js";
import { adoptMedia } from "./media-adoption.js";
import { completeMediaCrop, findMediaCropWork, submitMediaCrop } from "./media-crop.js";
import { completeMediaPreparation, findMediaPreparation } from "./media-preparation.js";
import { reserveMedia } from "./media-reservation.js";
import type {
  MediaAdoptionRequest,
  MediaCropCompletion,
  MediaCropRequest,
  MediaPreparationCompletion,
  MediaReservationRequest,
  MediaScope,
  MediaVariantScope,
} from "./media-types.js";

export type {
  MediaAdoptionRequest,
  MediaAdoptionResult,
  MediaCropCompletion,
  MediaCropRequest,
  MediaCropResult,
  MediaCropWork,
  MediaKind,
  MediaPreparationCompletion,
  MediaPreparationSource,
  MediaReservationRequest,
  MediaReservationResult,
  MediaScope,
  MediaStatus,
  MediaStoredVariant,
  MediaVariantScope,
  MediaUploadDescriptor,
} from "./media-types.js";

export function createMediaRepository({ sql }: DatabaseConnection) {
  const writeIsolation = "isolation level read committed";
  return {
    reserve: (request: MediaReservationRequest) =>
      sql.begin(writeIsolation, (tx) => reserveMedia(tx, request)),
    claimDeliveryProof: (mediaId: string) => claimDeliveryProofMedia(sql, mediaId),
    finishDeliveryProof: (mediaId: string) =>
      sql.begin((tx) => finishDeliveryProofMedia(tx, mediaId)),
    read: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope, "owner_or_attached_editor");
      if (!media) return undefined;
      return mediaStatus(media, media.sessionId);
    },
    findUpload: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope, "owner");
      if (!media) return undefined;
      const { contentType, bytes } = media;
      return { contentType, bytes };
    },
    findPreview: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope, "owner");
      return media?.status === "awaiting_crop" && media.previewKey !== null
        ? { key: media.previewKey }
        : undefined;
    },
    findVariant: async (scope: MediaVariantScope) => {
      const media = await readVisibleMedia(sql, scope, "owner_or_attached_editor");
      if (media?.status !== "ready") return undefined;
      const variant = media.variants.find(
        ({ format, width }) => format === scope.format && width === scope.width,
      );
      return variant && { key: variant.key };
    },
    acceptUpload: (request: MediaAdoptionRequest) =>
      sql.begin(writeIsolation, (tx) => adoptMedia(tx, request)),
    submitCrop: (request: MediaCropRequest) =>
      sql.begin(writeIsolation, (tx) => submitMediaCrop(tx, request)),
    findCropWork: (mediaId: string) => findMediaCropWork(sql, mediaId),
    completeCrop: (request: MediaCropCompletion) => completeMediaCrop(sql, request),
    findPreparation: (mediaId: string) => findMediaPreparation(sql, mediaId),
    completePreparation: (request: MediaPreparationCompletion) =>
      completeMediaPreparation(sql, request),
  };
}
