import { discoveryLocationInput, discoveryLocationOutput } from "@zaafran/contracts/discovery";
import { wilayaListOutput } from "@zaafran/contracts/merchant";
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

export type ReadWilayas = () => Promise<z.infer<typeof wilayaListOutput>["wilayas"]>;

export function registerDiscoveryRoutes(
  api: FastifyInstance,
  services: DiscoveryServices | undefined,
  listWilayas?: ReadWilayas,
) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/wilayas",
    {
      config: { policy: { kind: "public" } },
      onSend(_request, reply, payload) {
        reply.header(
          "cache-control",
          reply.statusCode === 200 ? "public, max-age=300, s-maxage=3600" : "no-store",
        );
        return Promise.resolve(payload);
      },
      schema: {
        response: {
          200: wilayaListOutput,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      if (!listWilayas) return sendProblem(reply, 503);
      return reply.send({ wilayas: await listWilayas() });
    },
  );
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
