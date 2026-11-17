import { randomBytes } from "node:crypto";
import { isPublicLocale } from "@zaafran/i18n/locales";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { canRenderAdminPage, canRenderMerchantPage } from "./auth/operator-page-access";
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

function operatorPage({
  locale,
  area,
  target,
  section,
}: {
  locale: string;
  area: string | undefined;
  target: string | undefined;
  section: string | undefined;
}) {
  if (area === "admin") {
    return { signIn: "/" + locale + "/sign-in?purpose=admin", allowed: canRenderAdminPage };
  }
  if (area !== "merchant" || !target || target === "apply" || !section) return undefined;
  return {
    signIn: "/" + locale + "/sign-in?continue=merchant-status",
    allowed: (headers: Headers) => canRenderMerchantPage(headers, { merchantId: target, section }),
  };
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = randomBytes(16).toString("base64");
  const { pathname } = request.nextUrl;
  const policy = pathname.startsWith("/v1/")
    ? "default-src 'none'; frame-ancestors 'none'"
    : createPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", policy);

  const [, locale, area, target, section] = pathname.split("/");
  const operator = isPublicLocale(locale)
    ? operatorPage({ locale, area, target, section })
    : undefined;
  const denied = operator && !(await operator.allowed(request.headers));
  const response = denied
    ? NextResponse.redirect(new URL(operator.signIn, request.url))
    : pathname === "/" || isPublicLocale(locale)
      ? localize(new NextRequest(request, { headers }))
      : NextResponse.next({ request: { headers } });

  if (operator) response.headers.set("Cache-Control", "no-store");
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
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
