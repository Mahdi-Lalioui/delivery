import { createHmac, timingSafeEqual } from "node:crypto";
import { merchantMembershipsOutput } from "@zaafran/contracts/merchant";
import { previewApiDestination } from "../preview-settings";

function testApiOrigin(headers: Headers): string | undefined {
  const key = process.env.AWID_AUTH_E2E_PROXY_KEY;
  const port = headers.get("x-awid-test-api-port");
  const signature = headers.get("x-awid-test-api-signature");
  if (
    !key ||
    !port ||
    !/^[0-9]{1,5}$/u.test(port) ||
    !signature ||
    !/^[a-f0-9]{64}$/u.test(signature)
  )
    return undefined;
  if (Number(port) < 1 || Number(port) > 65535) return undefined;
  const expected = createHmac("sha256", key).update(port).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
    ? "http://127.0.0.1:" + port
    : undefined;
}

function apiOrigin(headers: Headers): string | undefined {
  const composeOrigin = process.env.AWID_OPERATOR_API_ORIGIN;
  if (composeOrigin !== undefined) {
    const url = URL.parse(composeOrigin);
    if (
      url?.protocol !== "http:" ||
      url.hostname !== "api" ||
      url.port !== "3002" ||
      url.origin !== composeOrigin
    )
      return undefined;
    return url.origin;
  }
  const destination = previewApiDestination(process.env);
  if (destination) return new URL(destination).origin;
  if (process.env.NODE_ENV === "development")
    return "http://127.0.0.1:" + (process.env.API_PORT ?? "3002");
  // Playwright runs isolated loopback APIs behind one shared Next process.
  return testApiOrigin(headers);
}

function readSessionCookie(headers: Headers): string | undefined {
  const sessions = (headers.get("cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith("__Host-session="));
  const [session] = sessions;
  if (sessions.length !== 1 || !session || !/^__Host-session=[A-Za-z0-9_-]{43}$/u.test(session))
    return undefined;
  return session;
}

async function readOperatorAccess(headers: Headers, path: string): Promise<Response | undefined> {
  const session = readSessionCookie(headers);
  if (!session) return undefined;
  try {
    const origin = apiOrigin(headers);
    if (!origin) return undefined;
    return await fetch(origin + path, {
      cache: "no-store",
      redirect: "error",
      headers: { cookie: session },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return undefined;
  }
}

export async function canRenderAdminPage(headers: Headers): Promise<boolean> {
  const response = await readOperatorAccess(headers, "/v1/admin/merchant-applications/notice");
  return response?.status === 200;
}

function roleAllowsPage(role: "owner" | "manager" | "staff", section: string): boolean {
  if (section === "board") return true;
  if (section === "billing" || section === "staff") return role === "owner";
  return role !== "staff";
}

export async function canRenderMerchantPage(
  headers: Headers,
  { merchantId, section }: { merchantId: string; section: string },
): Promise<boolean> {
  const response = await readOperatorAccess(headers, "/v1/me/merchants");
  if (response?.status !== 200) return false;
  const payload: unknown = await response.json().catch(() => undefined);
  const result = merchantMembershipsOutput.safeParse(payload);
  return (
    result.success &&
    result.data.memberships.some(
      (entry) =>
        entry.merchantId === merchantId.toLowerCase() && roleAllowsPage(entry.role, section),
    )
  );
}

export async function canRenderCourierPage(headers: Headers): Promise<boolean> {
  const response = await readOperatorAccess(headers, "/v1/courier/jobs");
  return response?.status === 200;
}
