import {
  adminBillingSettingsInput,
  adminBillingSettingsOutput,
  billingSettingsDefaults,
} from "@zaafran/contracts/billing";
import { http, HttpResponse } from "msw";
import { billingMockIds as ids } from "./admin-billing-handlers";

export function billingSettingsHandlers() {
  let settings = adminBillingSettingsOutput.parse({
    sessionId: ids.sessionId,
    settings: billingSettingsDefaults,
  }).settings;
  return [
    http.get("*/v1/admin/billing/settings", () =>
      HttpResponse.json(adminBillingSettingsOutput.parse({ sessionId: ids.sessionId, settings })),
    ),
    http.put("*/v1/admin/billing/settings", async ({ request }) => {
      if (request.headers.get("x-expected-session-id") !== ids.sessionId) {
        return HttpResponse.json(
          {
            type: "https://zaafran.invalid/problems/session_changed",
            title: "Session changed",
            status: 409,
            code: "session_changed",
            requestId: ids.paymentId,
          },
          { status: 409 },
        );
      }
      const input = adminBillingSettingsInput.safeParse(await request.json());
      if (!input.success) return HttpResponse.json({ code: "invalid_request" }, { status: 400 });
      settings = input.data.settings;
      return HttpResponse.json(
        adminBillingSettingsOutput.parse({ sessionId: ids.sessionId, settings }),
      );
    }),
  ];
}
