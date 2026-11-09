import {
  publicRestaurantParams,
  publicRestaurantOutput,
  publicRestaurantCategoryParams,
  publicRestaurantItemsQuery,
  publicRestaurantItemsOutput,
  publicRestaurantItemParams,
  publicRestaurantItemQuery,
  publicRestaurantItemOutput,
} from "@zaafran/contracts/restaurant";
import { readMenuItemCursor } from "@zaafran/contracts/menu";
import { problemResponseSchema } from "@zaafran/contracts/health";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { sendProblem } from "./problems.js";
import { revalidatePublicJson } from "./public-json-cache.js";

type Failure = { kind: "not_found" | "revision_conflict" | "invalid_cursor" };
export interface PublicRestaurantServices {
  repository: {
    read: (input: {
      slug: string;
      now: Date;
    }) => Promise<({ kind: "found" } & z.infer<typeof publicRestaurantOutput>) | Failure>;
    list: (input: {
      slug: string;
      categoryId: string;
      limit: number;
      cursor?: { revision: number; itemId: string };
      now: Date;
    }) => Promise<({ kind: "listed" } & z.infer<typeof publicRestaurantItemsOutput>) | Failure>;
    detail: (input: {
      slug: string;
      itemId: string;
      expectedRevision: number;
      now: Date;
    }) => Promise<({ kind: "found" } & z.infer<typeof publicRestaurantItemOutput>) | Failure>;
  };
  now: () => Date;
}
const config = { policy: { kind: "public" } } as const;
const notModified = { 304: z.void() };
const errors = {
  400: problemResponseSchema,
  404: problemResponseSchema,
  409: problemResponseSchema,
  429: problemResponseSchema,
  503: problemResponseSchema,
};
function present(reply: FastifyReply, result: { kind: string }) {
  const { kind, ...value } = result;
  if (kind === "found" || kind === "listed") return reply.send(value);
  return sendProblem(reply, kind === "not_found" ? 404 : 409, kind);
}
export function registerPublicRestaurantRoutes(
  api: FastifyInstance,
  services?: PublicRestaurantServices,
) {
  const routes = api.withTypeProvider<ZodTypeProvider>();
  routes.get(
    "/v1/merchants/:slug",
    {
      config,
      onSend: revalidatePublicJson,
      schema: {
        params: publicRestaurantParams,
        response: { 200: publicRestaurantOutput, ...notModified, ...errors },
      },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      return present(
        reply,
        await services.repository.read({ slug: request.params.slug, now: services.now() }),
      );
    },
  );
  routes.get(
    "/v1/merchants/:slug/categories/:categoryId/items",
    {
      config,
      onSend: revalidatePublicJson,
      schema: {
        params: publicRestaurantCategoryParams,
        querystring: publicRestaurantItemsQuery,
        response: { 200: publicRestaurantItemsOutput, ...notModified, ...errors },
      },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      const { cursor, limit } = request.query;
      const parsed = cursor ? readMenuItemCursor(cursor) : undefined;
      return present(
        reply,
        await services.repository.list({
          ...request.params,
          categoryId: request.params.categoryId.toLowerCase(),
          limit,
          ...(parsed ? { cursor: parsed } : {}),
          now: services.now(),
        }),
      );
    },
  );
  routes.get(
    "/v1/merchants/:slug/items/:itemId",
    {
      config,
      onSend: revalidatePublicJson,
      schema: {
        params: publicRestaurantItemParams,
        querystring: publicRestaurantItemQuery,
        response: { 200: publicRestaurantItemOutput, ...notModified, ...errors },
      },
    },
    async (request, reply) => {
      if (!services) return sendProblem(reply, 503);
      return present(
        reply,
        await services.repository.detail({
          ...request.params,
          itemId: request.params.itemId.toLowerCase(),
          expectedRevision: request.query.expectedRevision,
          now: services.now(),
        }),
      );
    },
  );
}
