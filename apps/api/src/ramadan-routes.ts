import { problemResponseSchema } from "@zaafran/contracts/health";
import { ramadanTodayOutput, ramadanTodayQuery } from "@zaafran/contracts/scheduling";
import { getAlgiersDate } from "@zaafran/domain/hours";
import { calculateMaghrib } from "@zaafran/geo/maghrib";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { sendProblem } from "./problems.js";

export interface RamadanServices {
  readonly isRamadanEnabled: () => Promise<boolean>;
  readonly findCoordinates: (
    communeId: string,
  ) => Promise<{ latitude: number; longitude: number } | undefined>;
  readonly now: () => Date;
}

export function registerRamadanRoutes(api: FastifyInstance, services: RamadanServices | undefined) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/ramadan/today",
    {
      config: { policy: { kind: "public" } },
      schema: {
        querystring: ramadanTodayQuery,
        response: {
          200: ramadanTodayOutput,
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
      if (!(await services.isRamadanEnabled())) {
        return reply.send({ isRamadan: false, maghribAt: null });
      }
      const coordinates = await services.findCoordinates(request.query.communeId.toLowerCase());
      if (!coordinates) return sendProblem(reply, 404);
      const { isoDate } = getAlgiersDate(services.now().getTime());
      const maghribAt = calculateMaghrib({ date: isoDate, coordinates });
      if (maghribAt === null) return sendProblem(reply, 503);
      return reply.send({ isRamadan: true, maghribAt: new Date(maghribAt).toISOString() });
    },
  );
}
