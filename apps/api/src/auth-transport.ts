const sessionCookieName = "__Host-session";
const cookieAttributes = "Secure; HttpOnly; SameSite=Lax";

type Credential = { readonly transport: "web" | "bearer"; readonly token: string };
type BrowserHeaders = {
  readonly origin?: string | undefined;
  readonly "sec-fetch-site"?: string | readonly string[] | undefined;
};

export function readSessionCredential(
  {
    authorization,
    cookie,
  }: { readonly authorization?: string | undefined; readonly cookie?: string | undefined },
  authorizationCount = 1,
): Credential | undefined {
  const sessions = (cookie ?? "")
    .split(";")
    .map((field) => field.trim())
    .filter((field) => field.startsWith(sessionCookieName + "="));
  if (authorizationCount > 1 || sessions.length > 1) return undefined;
  if (authorization !== undefined) {
    return sessions.length ? undefined : readBearer(authorization);
  }
  const token = sessions[0]?.slice(sessionCookieName.length + 1);
  return token ? { transport: "web", token } : undefined;
}

function readBearer(authorization: string): Credential | undefined {
  const token = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(authorization)?.[1];
  return token ? { transport: "bearer", token } : undefined;
}

export function hasSameOrigin(headers: BrowserHeaders, expectedOrigin: string): boolean {
  const fetchSite = headers["sec-fetch-site"];
  return (
    headers.origin === expectedOrigin && (fetchSite === undefined || fetchSite === "same-origin")
  );
}

export function isNativeTransport(headers: BrowserHeaders): boolean {
  return headers.origin === undefined && headers["sec-fetch-site"] === undefined;
}

export function sessionCookie({
  token,
  expiresAt,
  now,
}: {
  readonly token: string;
  readonly expiresAt: Date;
  readonly now: Date;
}): string {
  const maxAge = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
  return (
    sessionCookieName +
    "=" +
    token +
    "; Path=/; Max-Age=" +
    maxAge.toString() +
    "; " +
    cookieAttributes
  );
}

export const clearSessionCookie = sessionCookieName + "=; Path=/; Max-Age=0; " + cookieAttributes;
