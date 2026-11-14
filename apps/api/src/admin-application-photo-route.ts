import { problemResponseSchema } from "@zaafran/contracts/health";
import { photoVariantWidths } from "@zaafran/contracts/media";
import type { createMerchantRepository } from "@zaafran/db/merchant";
import type { MediaStore } from "@zaafran/media";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequestActor } from "./policy.js";
import { sendProblem } from "./problems.js";

export interface ApplicationPhotoServices {
  readonly repository: Pick<
    ReturnType<typeof createMerchantRepository>,
    "findApplicationPhotoVariant"
  >;
  readonly store: MediaStore;
}

const adminConfig = { policy: { kind: "roles", roles: ["admin"] } } as const;
const publishedWidths = new Set<string>(photoVariantWidths.map(String));
const params = z.strictObject({
  merchantId: z.uuid(),
  mediaId: z.uuid(),
  width: z.string().refine((width) => publishedWidths.has(width)),
});
const photoErrors = {
  400: problemResponseSchema,
  401: problemResponseSchema,
  403: problemResponseSchema,
  404: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

/** Streams a private application photo (D-007) to an admin reviewing the merchant's signup. */
export function registerAdminApplicationPhotoRoute(
  api: FastifyInstance,
  services: ApplicationPhotoServices | undefined,
): void {
  // The stream body is binary, so only the params and problems use the zod type provider schema.
  api.get<{ Params: { merchantId: string; mediaId: string; width: string } }>(
    "/v1/admin/merchant-applications/:merchantId/photos/:mediaId/:width",
    { config: adminConfig, schema: { params, response: photoErrors } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      const actor = getRequestActor(request);
      if (!actor) return sendProblem(reply, 401);
      if (!services) return sendProblem(reply, 503);
      const variant = await services.repository.findApplicationPhotoVariant({
        adminUserId: actor.accountId,
        merchantId: request.params.merchantId.toLowerCase(),
        mediaId: request.params.mediaId.toLowerCase(),
        width: Number(request.params.width),
      });
      const object = variant && (await services.store.get(variant.storageKey));
      if (!object) return sendProblem(reply, 404);
      return reply
        .type("image/webp")
        .header("content-length", object.bytes.toString())
        .send(object.body);
    },
  );
}
