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
