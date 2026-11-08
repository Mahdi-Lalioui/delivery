import { problemResponseSchema } from "@zaafran/contracts/health";
import { publicSearchOutput, publicSearchQuery } from "@zaafran/contracts/search";
import { normalize } from "@zaafran/domain/search";
import synonyms from "@zaafran/i18n/search-synonyms" with { type: "json" };
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { z } from "zod";
import { sendProblem } from "./problems.js";

export interface DiscoverySearchServices {
  readonly search: (query: {
    q: string;
    limit: number;
    variants: readonly string[];
  }) => Promise<z.infer<typeof publicSearchOutput>>;
}

const aliasGroups = Object.values(synonyms).map((terms) => [...new Set(terms.map(normalize))]);
const aliases = new Map(
  aliasGroups.flatMap((group) => group.map((term) => [term, group] as const)),
);

export function registerDiscoverySearchRoutes(
  api: FastifyInstance,
  services?: DiscoverySearchServices,
) {
  api.withTypeProvider<ZodTypeProvider>().get(
    "/v1/search",
    {
      config: { policy: { kind: "public" } },
      onSend(_request, reply, payload) {
        reply.header("cache-control", "no-store");
        return Promise.resolve(payload);
      },
      schema: {
        querystring: publicSearchQuery,
        response: {
          200: publicSearchOutput,
          400: problemResponseSchema,
          429: problemResponseSchema,
          503: problemResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      const q = normalize(request.query.q);
      if (!q) return reply.send({ restaurants: [], dishes: [] });
      const variants = aliases.get(q)?.filter((alias) => alias !== q) ?? [];
      try {
        return await reply.send(await services.search({ q, limit: request.query.limit, variants }));
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "57014"
        ) {
          return sendProblem(reply, 503, "search_busy");
        }
        throw error;
      }
    },
  );
}
