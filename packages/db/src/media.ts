import type { DatabaseConnection } from "./database.js";
import { readVisibleMedia } from "./media-access.js";
import { adoptMedia } from "./media-adoption.js";
import { reserveMedia } from "./media-reservation.js";
import type { MediaAdoptionRequest, MediaReservationRequest, MediaScope } from "./media-types.js";

export type {
  MediaAdoptionRequest,
  MediaAdoptionResult,
  MediaReservationRequest,
  MediaReservationResult,
  MediaScope,
  MediaStatus,
  MediaUploadDescriptor,
} from "./media-types.js";

export function createMediaRepository({ sql }: DatabaseConnection) {
  const writeIsolation = "isolation level read committed";
  return {
    reserve: (request: MediaReservationRequest) =>
      sql.begin(writeIsolation, (tx) => reserveMedia(tx, request)),
    read: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope);
      if (!media) return undefined;
      const { mediaId, sessionId, kind, status } = media;
      return { mediaId, sessionId, kind, status };
    },
    findUpload: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope);
      if (!media) return undefined;
      const { contentType, bytes } = media;
      return { contentType, bytes };
    },
    acceptUpload: (request: MediaAdoptionRequest) =>
      sql.begin(writeIsolation, (tx) => adoptMedia(tx, request)),
  };
}
