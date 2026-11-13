import { problemResponseSchema } from "@zaafran/contracts/health";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { privatePhotoPolicy } from "./media-route-shared.js";
import type { MediaReservationServices } from "./media-route-shared.js";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

const previewErrors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

/** Streams the private WebP the owner crops against; it never leaves the authenticated API. */
export function registerMediaPreview(
  api: FastifyInstance,
  services: MediaReservationServices | undefined,
): void {
  // The stream body is binary, so only the params and problems use the zod type provider schema.
  api.get<{ Params: { mediaId: string } }>(
    "/v1/media/:mediaId/preview",
    {
      config: privatePhotoPolicy,
      schema: { params: z.strictObject({ mediaId: z.uuid() }), response: previewErrors },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const preview = await services.repository.findPreview({
        accountId: actor.accountId,
        sessionId: actor.sessionId,
        mediaId: request.params.mediaId.toLowerCase(),
        now: services.now(),
      });
      const object = preview && (await services.store.get(preview.previewKey));
      if (!object) return sendProblem(reply, 404);
      return reply
        .type("image/webp")
        .header("content-length", object.bytes.toString())
        .send(object.body);
    },
  );
}
