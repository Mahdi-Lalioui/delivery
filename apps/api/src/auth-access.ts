import type { ResolvedSession } from "@zaafran/db/auth";
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import type { AuthService } from "./auth-service.js";
import {
  hasSameOrigin,
  isNativeTransport,
  readSessionCredential,
  sessionCookie,
} from "./auth-transport.js";
import type { ResolveActor } from "./policy.js";
import { sendProblem } from "./problems.js";

interface Authentication {
  readonly service: AuthService;
  readonly publicOrigin: string;
}

type WebSession = { readonly session: ResolvedSession; readonly token: string };

function mayChangeState(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

function hasSessionCookie(cookie: string | undefined): boolean {
  return /(?:^|;)\s*__Host-session=/.test(cookie ?? "");
}

function authorizationCount(raw: {
  headersDistinct?: Readonly<Record<string, readonly string[] | undefined>>;
}): number | undefined {
  // Real sockets retain duplicate headers here. Injected requests already expose normalized headers.
  return raw.headersDistinct?.authorization?.length;
}

export function createAuthAccess(auth: Authentication | undefined) {
  const sessions = new WeakMap<FastifyRequest, ResolvedSession>();
  const webSessions = new WeakMap<FastifyRequest, WebSession>();

  const resolveActor: ResolveActor = async (request) => {
    if (!auth) return undefined;
    const credential = readSessionCredential(request.headers, authorizationCount(request.raw));
    if (!credential) return undefined;
    if (credential.transport === "bearer" && !isNativeTransport(request.headers)) return undefined;
    const session = await auth.service.resolveSession(credential);
    if (!session) return undefined;
    sessions.set(request, session);
    if (credential.transport === "web")
      webSessions.set(request, { session, token: credential.token });
    return { accountId: session.userId, role: session.kind === "admin" ? "admin" : "customer" };
  };

  return {
    auth,
    resolveActor,
    getSession: (request: FastifyRequest) => sessions.get(request),

    guardCookieMutation: (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ) => {
      if (
        auth &&
        mayChangeState(request.method) &&
        hasSessionCookie(request.headers.cookie) &&
        !hasSameOrigin(request.headers, auth.publicOrigin)
      ) {
        sendProblem(reply, 403);
        return;
      }
      done();
    },

    refreshCookie(request: FastifyRequest, reply: FastifyReply) {
      const current = webSessions.get(request);
      if (!current || reply.statusCode >= 400 || reply.hasHeader("set-cookie")) return;
      const { token, session } = current;
      reply.header(
        "set-cookie",
        sessionCookie({ token, now: session.lastSeenAt, expiresAt: session.expiresAt }),
      );
    },
  };
}

export type AuthAccess = ReturnType<typeof createAuthAccess>;
