import type { DatabaseConnection } from "./database.js";
import { readVisibleMedia } from "./media-access.js";
import { adoptMedia } from "./media-adoption.js";
import { reserveMedia } from "./media-reservation.js";
import { describeMedia } from "./media-status.js";
import type {
  MediaAdoptionRequest,
  MediaAdoptionResult,
  MediaIdentity,
  MediaReservationRequest,
  MediaReservationResult,
  MediaScope,
} from "./media-types.js";

export type {
  MediaAdoptionRequest,
  MediaAdoptionResult,
  MediaReservationRequest,
  MediaReservationResult,
  MediaScope,
  MediaStatus,
  MediaUploadDescriptor,
} from "./media-types.js";

/** Commands report the photo's current state, which the worker may have advanced. */
async function describeReservation(
  sql: DatabaseConnection["sql"],
  result: MediaReservationResult<MediaIdentity>,
): Promise<MediaReservationResult> {
  if (!("media" in result)) return result;
  const media = await describeMedia(sql, result.media);
  return media ? { kind: result.kind, media } : { kind: "not_found" };
}

async function describeAdoption(
  sql: DatabaseConnection["sql"],
  result: MediaAdoptionResult<MediaIdentity>,
): Promise<MediaAdoptionResult> {
  if (!("media" in result)) return result;
  const media = await describeMedia(sql, result.media);
  return media ? { kind: result.kind, media } : { kind: "not_found" };
}

export function createMediaRepository({ sql }: DatabaseConnection) {
  const writeIsolation = "isolation level read committed";

  return {
    reserve: async (request: MediaReservationRequest) =>
      describeReservation(sql, await sql.begin(writeIsolation, (tx) => reserveMedia(tx, request))),
    read: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope);
      if (!media) return undefined;
      const { mediaId, sessionId, kind } = media;
      return describeMedia(sql, { mediaId, sessionId, kind });
    },
    findUpload: async (scope: MediaScope) => {
      const media = await readVisibleMedia(sql, scope);
      if (!media) return undefined;
      const { contentType, bytes } = media;
      return { contentType, bytes };
    },
    acceptUpload: async (request: MediaAdoptionRequest) =>
      describeAdoption(sql, await sql.begin(writeIsolation, (tx) => adoptMedia(tx, request))),
  };
}
