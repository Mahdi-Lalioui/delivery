import process from "node:process";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { isPreviewDemo, previewApiDestination } from "./src/preview-settings.ts";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function apiDestination(development: boolean, demo: boolean) {
  return (
    previewApiDestination(process.env) ??
    (development && !demo
      ? `http://127.0.0.1:${process.env.API_PORT ?? "3002"}/v1/:path*`
      : undefined)
  );
}

const localFixturePaths = [
  "/me/orders",
  "/me/orders/:path*",
  "/me/favourites",
  "/me/favourites/:path*",
  "/orders/:orderId/rating",
  "/merchants/:merchantId/analytics",
  "/merchants/:merchantId/reviews",
  "/merchants/:merchantId/reviews/:path*",
  "/admin/dashboard/today",
];

function apiRewrites(development: boolean, demo: boolean) {
  const destination = apiDestination(development, demo);
  const rewrites = localFixturePaths
    .filter(() => development && process.env.ZAAFRAN_LOCAL_DEMO === "1")
    .map((path) => ({ source: "/v1" + path, destination: "/local-demo-api" + path }));
  if (destination) rewrites.push({ source: "/v1/:path*", destination });
  return rewrites;
}

function localDemoIndicator(development: boolean): false | undefined {
  return development && process.env.ZAAFRAN_LOCAL_DEMO === "1" ? false : undefined;
}

export default function config(phase: string): NextConfig {
  const designBuild = process.env.ZAAFRAN_DESIGN_BUILD;
  if (designBuild !== undefined && designBuild !== "1") {
    throw new Error("ZAAFRAN_DESIGN_BUILD must be 1 or unset");
  }

  const demo = isPreviewDemo(process.env);
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  const includeDesign = development || designBuild === "1" || demo;
  const beforeFiles = apiRewrites(development, demo);

  return withNextIntl({
    distDir: designBuild ? ".next-design" : ".next",
    env: { ZAAFRAN_DESIGN_ENABLED: includeDesign ? "1" : "0" },
    pageExtensions: includeDesign ? ["design.tsx", "tsx", "ts"] : ["tsx", "ts"],
    poweredByHeader: false,
    ...(localDemoIndicator(development) === false && { devIndicators: false as const }),
    rewrites: () => Promise.resolve({ beforeFiles }),
    transpilePackages: ["@zaafran/config", "@zaafran/i18n", "@zaafran/ui"],
  });
}
