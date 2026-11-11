type Environment = Readonly<Record<string, string | undefined>>;

export function isPreviewDemo(environment: Environment): boolean {
  return environment.ZAAFRAN_PREVIEW_DEMO === "1" && environment.VERCEL_ENV === "preview";
}

export function previewApiDestination(environment: Environment): string | undefined {
  const configured = environment.ZAAFRAN_API_ORIGIN;
  if (configured === undefined) return undefined;
  const url = URL.parse(configured);
  if (url?.protocol !== "https:" || url.origin !== configured)
    throw new Error("ZAAFRAN_API_ORIGIN must be an HTTPS origin without a path or credentials.");
  if (isPreviewDemo(environment))
    throw new Error("Set either ZAAFRAN_API_ORIGIN or ZAAFRAN_PREVIEW_DEMO.");
  return url.origin + "/v1/:path*";
}

export function mapTileDestination(environment: Environment): string | undefined {
  const configured = environment.ZAAFRAN_TILE_ORIGIN;
  if (!configured) return previewApiDestination(environment)?.replace("/v1/", "/tiles/");
  const url = URL.parse(configured);
  const isLoopback = url?.protocol === "http:" && url.hostname === "127.0.0.1";
  if (!url || url.origin !== configured || (!isLoopback && url.protocol !== "https:"))
    throw new Error("ZAAFRAN_TILE_ORIGIN must be an HTTPS or loopback HTTP origin without a path.");
  return url.origin + "/:path*";
}
