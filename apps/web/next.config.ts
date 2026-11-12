import process from "node:process";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import {
  isPreviewDemo,
  mapTileDestination,
  previewApiDestination,
} from "./src/preview-settings.ts";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

function apiDestination(development: boolean, demo: boolean) {
  return (
    previewApiDestination(process.env) ??
    (development && !demo
      ? `http://127.0.0.1:${process.env.API_PORT ?? "3002"}/v1/:path*`
      : undefined)
  );
}

function rewrites(development: boolean, demo: boolean) {
  const destination = apiDestination(development, demo);
  const tiles = mapTileDestination(process.env);
  return [
    ...(destination ? [{ source: "/v1/:path*", destination }] : []),
    ...(tiles
      ? [
          {
            source: "/tiles/algeria/:path*",
            destination: tiles.replace("/:path*", "/algeria/:path*"),
          },
        ]
      : []),
  ];
}

export default function config(phase: string): NextConfig {
  const designBuild = process.env.ZAAFRAN_DESIGN_BUILD;
  if (designBuild !== undefined && designBuild !== "1") {
    throw new Error("ZAAFRAN_DESIGN_BUILD must be 1 or unset");
  }

  const demo = isPreviewDemo(process.env);
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  const includeDesign = development || designBuild === "1" || demo;
  const beforeFiles = rewrites(development, demo);

  return withNextIntl({
    distDir: designBuild ? ".next-design" : ".next",
    env: { ZAAFRAN_DESIGN_ENABLED: includeDesign ? "1" : "0" },
    pageExtensions: includeDesign ? ["design.tsx", "tsx", "ts"] : ["tsx", "ts"],
    poweredByHeader: false,
    devIndicators: false,
    ...(beforeFiles.length && { rewrites: () => Promise.resolve({ beforeFiles }) }),
    transpilePackages: ["@zaafran/config", "@zaafran/i18n", "@zaafran/ui"],
  });
}
