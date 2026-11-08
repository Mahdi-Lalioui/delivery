import {
  adminAuditOutput,
  adminFlagInput,
  adminFlagOutput,
  adminPlatformSettingInput,
  adminPlatformSettingsOutput,
  publicFlagsOutput,
} from "@zaafran/contracts/admin-ops";
import { http, HttpResponse } from "msw";

export const platformMockIds = {
  sessionId: "019d6abc-0000-7000-8000-000000000001",
  actorId: "019d6abc-0000-7000-8000-000000000501",
  eventId: "019d6abc-0000-7000-8000-000000000502",
} as const;
const ids = platformMockIds;

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: `https://zaafran.invalid/problems/${code}`,
      title: code,
      status,
      code,
      requestId: "mock",
    },
    { status },
  );
}

export function platformMockState() {
  const settings = adminPlatformSettingsOutput.parse({
    sessionId: ids.sessionId,
    settings: {
      order_accept_timeout_seconds: 180,
      first_order_cash_cap_dzd: 5000,
      subscription_price_dzd: 5000,
      subscription_trial_days: 30,
      maintenance_banner: null,
    },
  }).settings;
  const flags: Record<string, boolean> = {
    menu_photo_import: false,
    online_payments: false,
    ramadan_mode: true,
  };
  const audit = adminAuditOutput.parse({
    sessionId: ids.sessionId,
    nextCursor: null,
    events: [
      {
        id: ids.eventId,
        actorId: ids.actorId,
        entity: "flag",
        entityId: "ramadan_mode",
        action: "flag.enabled",
        reason: "Début du Ramadan",
        createdAt: "2027-02-08T09:00:00.000Z",
      },
    ],
  }).events;
  return { settings, flags, audit };
}

type State = ReturnType<typeof platformMockState>;

export function platformHandlers(state: State = platformMockState()) {
  const isSession = (request: Request) =>
    request.headers.get("x-expected-session-id") === ids.sessionId;
  return [
    http.get("*/v1/admin/settings", () =>
      HttpResponse.json(
        adminPlatformSettingsOutput.parse({ sessionId: ids.sessionId, settings: state.settings }),
      ),
    ),
    http.get("*/v1/flags", () =>
      HttpResponse.json(
        publicFlagsOutput.parse({
          flags: state.flags,
          maintenanceBanner: state.settings.maintenance_banner,
        }),
      ),
    ),
    http.put("*/v1/admin/settings/:key", async ({ request, params }) => {
      if (!isSession(request)) return problem(409, "session_changed");
      const input = adminPlatformSettingInput.safeParse(await request.json());
      if (!input.success || typeof params.key !== "string") return problem(400, "invalid_request");
      state.settings = { ...state.settings, [params.key]: input.data.value };
      return HttpResponse.json(
        adminPlatformSettingsOutput.parse({ sessionId: ids.sessionId, settings: state.settings }),
      );
    }),
    http.put("*/v1/admin/flags/:key", async ({ request, params }) => {
      if (!isSession(request)) return problem(409, "session_changed");
      const input = adminFlagInput.safeParse(await request.json());
      if (!input.success || typeof params.key !== "string") return problem(400, "invalid_request");
      state.flags[params.key] = input.data.isEnabled;
      return HttpResponse.json(
        adminFlagOutput.parse({
          key: params.key,
          isEnabled: input.data.isEnabled,
          scope: null,
          updatedAt: "2027-02-08T10:00:00.000Z",
        }),
      );
    }),
    http.get("*/v1/admin/audit", ({ request }) => {
      const entity = new URL(request.url).searchParams.get("entity");
      const events = state.audit.filter((event) => entity === null || event.entity === entity);
      return HttpResponse.json(
        adminAuditOutput.parse({ sessionId: ids.sessionId, nextCursor: null, events }),
      );
    }),
  ];
}
