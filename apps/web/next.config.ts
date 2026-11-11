import process from "node:process";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default function config(phase: string): NextConfig {
  const designBuild = process.env.ZAAFRAN_DESIGN_BUILD;
  if (designBuild !== undefined && designBuild !== "1") {
    throw new Error("ZAAFRAN_DESIGN_BUILD must be 1 or unset");
  }

  const includeDesign = phase === PHASE_DEVELOPMENT_SERVER || designBuild === "1";

  return withNextIntl({
    distDir: designBuild ? ".next-design" : ".next",
    env: { ZAAFRAN_DESIGN_ENABLED: includeDesign ? "1" : "0" },
    pageExtensions: includeDesign ? ["design.tsx", "tsx", "ts"] : ["tsx", "ts"],
    poweredByHeader: false,
    ...(phase === PHASE_DEVELOPMENT_SERVER && {
      rewrites: () =>
        Promise.resolve([
          {
            source: "/v1/:path*",
            destination: `http://127.0.0.1:${process.env.API_PORT ?? "3002"}/v1/:path*`,
          },
        ]),
    }),
    transpilePackages: ["@zaafran/config", "@zaafran/i18n", "@zaafran/ui"],
  });
}
