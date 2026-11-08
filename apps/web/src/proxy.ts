import { randomBytes } from "node:crypto";
import { isPublicLocale } from "@zaafran/i18n/locales";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const localize = createMiddleware(routing);

function createPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";
  const developmentScript = isDevelopment ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScript}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = randomBytes(16).toString("base64");
  const policy = createPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);

  const { pathname } = request.nextUrl;
  const locale = pathname.split("/")[1];
  const response =
    pathname === "/" || isPublicLocale(locale)
      ? localize(new NextRequest(request, { headers }))
      : NextResponse.next({ request: { headers } });

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Strict-Transport-Security", "max-age=31536000");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(self), camera=(self), microphone=(self)",
  );

  return response;
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$).*)"],
};
