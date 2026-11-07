import type { FastifyInstance, FastifyRequest } from "fastify";
import { sendProblem } from "./problems.js";

type Role =
  "customer" | "merchant_owner" | "merchant_manager" | "merchant_staff" | "courier" | "admin";

export interface Actor {
  readonly role: Role;
  readonly accountId: string;
}

type Policy =
  { readonly kind: "public" } | { readonly kind: "roles"; readonly roles: readonly Role[] };

export type ResolveActor = (request: FastifyRequest) => Promise<Actor | undefined>;

declare module "fastify" {
  interface FastifyContextConfig {
    policy?: Policy;
  }
}

interface Route {
  readonly method: string;
  readonly url: string;
}

const registeredRoutes = new WeakMap<FastifyInstance, Route[]>();

export function listRoutes(api: FastifyInstance): readonly Route[] {
  return [...(registeredRoutes.get(api) ?? [])];
}

export function recordRoutePolicies(api: FastifyInstance): void {
  const routes: Route[] = [];
  registeredRoutes.set(api, routes);
  api.addHook("onRoute", ({ config, method, url }) => {
    const policy = config?.policy;
    if (!policy || (policy.kind === "roles" && !policy.roles.length)) {
      throw new Error("Route has no explicit authorization policy: " + url);
    }
    for (const entry of typeof method === "string" ? [method] : method) {
      routes.push({ method: entry, url });
    }
  });
}

export function enforceRoutePolicies(api: FastifyInstance, resolveActor?: ResolveActor): void {
  api.addHook("onRequest", async (request, reply) => {
    if (request.is404) return;
    const policy = request.routeOptions.config.policy;
    if (!policy) return sendProblem(reply, 403);
    if (policy.kind === "public") return;
    const actor = await resolveActor?.(request);
    if (!actor) return sendProblem(reply, 401);
    if (!policy.roles.includes(actor.role)) return sendProblem(reply, 403);
  });
}
