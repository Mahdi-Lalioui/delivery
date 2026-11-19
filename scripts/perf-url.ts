export function mayIgnoreLocalCertificateErrors(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "localhost" ||
        url.hostname.endsWith(".localhost") ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

export function readPerfRestaurantSlug(value: string | undefined): string {
  const slug = value ?? "atelier-sidi-yahia";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new Error("Expected a safe restaurant slug for the performance run.");
  }
  return slug;
}
