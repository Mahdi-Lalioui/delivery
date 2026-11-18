import { afterEach, expect, test, vi } from "vitest";
import { canRenderAdminPage } from "../src/auth/operator-page-access.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("server-side role checks use the private Compose API origin", async () => {
  vi.stubEnv("AWID_OPERATOR_API_ORIGIN", "http://api:3002");
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", request);

  await expect(
    canRenderAdminPage(
      new Headers({
        cookie: "__Host-session=" + "s".repeat(43) + "; unrelated=ignored",
      }),
    ),
  ).resolves.toBe(true);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "http://api:3002/v1/admin/merchant-applications/notice",
    expect.objectContaining({ headers: { cookie: "__Host-session=" + "s".repeat(43) } }),
  );
});
