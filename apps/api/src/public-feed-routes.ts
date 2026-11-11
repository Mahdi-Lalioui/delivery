import {
  publicFeedOutput,
  publicFeedQuery,
  publicProfilePhotoParams,
} from "@zaafran/contracts/feed";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { MediaStore } from "@zaafran/media";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { binaryImage, sendImage } from "./image-response.js";
import { sendProblem } from "./problems.js";
import { revalidatePublicJson } from "./public-json-cache.js";

export interface PublicFeedServices {
  readonly repository: {
    list: (query: {
      limit: number;
      cursor?: string;
      now: Date;
    }) => Promise<z.infer<typeof publicFeedOutput>>;
    readPhoto: (
      params: z.infer<typeof publicProfilePhotoParams>,
    ) => Promise<{ key: string } | undefined>;
  };
  readonly store: Pick<MediaStore, "get">;
  readonly now: () => Date;
}

const config = { policy: { kind: "public" } } as const;
const readErrors = {
  400: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};

export function registerPublicFeedRoutes(api: FastifyInstance, services?: PublicFeedServices) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/feed",
    {
      config,
      onSend: revalidatePublicJson,
      schema: {
        querystring: publicFeedQuery,
        response: { 200: publicFeedOutput, 304: z.void(), ...readErrors },
      },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      const { limit, cursor } = request.query;
      return reply.send(
        await services.repository.list({
          limit,
          ...(cursor ? { cursor: cursor.toLowerCase() } : {}),
          now: services.now(),
        }),
      );
    },
  );
  routes.get(
    "/v1/merchants/:merchantId/profile/photos/:mediaId/variants/:format/:width",
    {
      config,
      schema: {
        params: publicProfilePhotoParams,
        response: {
          200: { content: { "image/avif": binaryImage, "image/webp": binaryImage } },
          404: problemResponseSchema,
          ...readErrors,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      if (!services) return sendProblem(reply, 503);
      const { merchantId, mediaId, format, width } = request.params;
      const photo = await services.repository.readPhoto({
        merchantId: merchantId.toLowerCase(),
        mediaId: mediaId.toLowerCase(),
        format,
        width,
      });
      if (!photo) return sendProblem(reply, 404);
      const object = await services.store.get(photo.key);
      return object ? sendImage(reply, object, `image/${format}`) : sendProblem(reply, 503);
    },
  );
}
