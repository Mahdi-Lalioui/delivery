import { discoveryLocationInput, discoveryLocationOutput } from "@zaafran/contracts/discovery";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { z } from "zod";
import { sendProblem } from "./problems.js";

export interface DiscoveryServices {
  readonly resolve: (
    input: z.infer<typeof discoveryLocationInput>,
  ) => Promise<z.infer<typeof discoveryLocationOutput> | undefined>;
}

export function registerDiscoveryRoutes(
  api: FastifyInstance,
  services: DiscoveryServices | undefined,
) {
  api.withTypeProvider<ZodTypeProvider>().post(
    "/v1/geo/serviceability",
    {
      config: { policy: { kind: "public" } },
      onSend(_request, reply, payload) {
        reply.header("cache-control", "no-store");
        return Promise.resolve(payload);
      },
      schema: {
        body: discoveryLocationInput,
        response: {
          200: discoveryLocationOutput,
          400: problemResponseSchema,
          404: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      const { body } = request;
      const selection =
        body.kind === "commune" ? { ...body, communeId: body.communeId.toLowerCase() } : body;
      const result = await services.resolve(selection);
      return result ? reply.send(result) : sendProblem(reply, 404);
    },
  );
}
