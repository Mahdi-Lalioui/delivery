import { publicProfilePhotoParams } from "@zaafran/contracts/feed";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { MediaStore } from "@zaafran/media";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { binaryImage, sendImage } from "./image-response.js";
import { sendProblem } from "./problems.js";

const params = publicProfilePhotoParams.extend({ itemId: z.uuid() });
export interface PublicItemPhotoServices {
  readPhoto: (input: z.infer<typeof params>) => Promise<{ key: string } | undefined>;
  store: Pick<MediaStore, "get">;
}
export function registerPublicItemPhotoRoutes(
  api: FastifyInstance,
  services?: PublicItemPhotoServices,
) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/merchants/:merchantId/items/:itemId/photos/:mediaId/variants/:format/:width",
    {
      config: { policy: { kind: "public" } },
      schema: {
        params,
        response: {
          200: { content: { "image/avif": binaryImage, "image/webp": binaryImage } },
          400: problemResponseSchema,
          404: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      if (!services) return sendProblem(reply, 503);
      const { merchantId, itemId, mediaId, format, width } = request.params;
      const photo = await services.readPhoto({
        merchantId: merchantId.toLowerCase(),
        itemId: itemId.toLowerCase(),
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
