import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MerchantStaffScreen } from "../src/merchant-staff/components/merchant-staff-screen";
import type { StaffState } from "../src/merchant-staff/staff-flow";
import {
  useMerchantStaff,
  type MerchantStaffControls,
} from "../src/merchant-staff/use-merchant-staff";

vi.mock("../src/merchant-staff/use-merchant-staff", () => ({ useMerchantStaff: vi.fn() }));

const merchantId = "019d6abc-1234-7234-8234-123456789def";
const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const invitationId = "019d6abc-1234-7234-8234-123456789bbb";
const ready: StaffState = {
  kind: "ready",
  list: {
    sessionId,
    merchantId,
    members: [
      {
        userId: "019d6abc-1234-7234-8234-123456789ddd",
        phoneE164: "+213550000281",
        role: "owner",
        isSelf: true,
      },
      {
        userId: "019d6abc-1234-7234-8234-123456789eee",
        phoneE164: "+213550000283",
        role: "manager",
        isSelf: false,
      },
    ],
    invitations: [
      {
        invitationId,
        phoneE164: "+213550000282",
        role: "staff",
        createdAt: "2026-11-08T09:00:00.000Z",
        expiresAt: "2026-11-15T09:00:00.000Z",
      },
    ],
  },
};

function render(overrides: Partial<MerchantStaffControls>, locale: "ar" | "fr" = "fr") {
  vi.mocked(useMerchantStaff).mockReturnValue({
    state: { kind: "loading" },
    invalidField: undefined,
    invite: vi.fn(),
    revoke: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  });
  const { merchantStaff } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} timeZone="Africa/Algiers" messages={{ merchantStaff }}>
      <MerchantStaffScreen merchantId={merchantId} locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[MER-23:web] lists members and open invitations with left-to-right phone numbers", () => {
  const html = render({ state: ready });
  const { merchantStaff } = getMessages("fr");

  expect(html).toContain('<bdi dir="ltr">0550 00 02 81</bdi>');
  expect(html).toContain('<bdi dir="ltr">0550 00 02 82</bdi>');
  for (const text of [
    merchantStaff.roleOwner,
    merchantStaff.roleManager,
    merchantStaff.roleStaff,
    merchantStaff.you,
    merchantStaff.invitations,
  ]) {
    expect(html).toContain(text);
  }
  expect(html).toContain('aria-label="Annuler l’invitation de 0550 00 02 82"');
  expect(html).not.toContain(sessionId);
});

test("[MER-23:web] offers a labelled invite form with only the manager and staff roles", () => {
  const html = render({ state: ready });

  expect(html).toMatch(/<label[^>]*for="staff-invite-phone"/);
  expect(html).toMatch(
    /<input(?=[^>]*id="staff-invite-phone")(?=[^>]*type="tel")(?=[^>]*dir="ltr")/,
  );
  expect(html.match(/type="radio"/g)).toHaveLength(2);
  expect(html).toContain('value="manager"');
  expect(html).toContain('value="staff"');
  expect(html).not.toContain('value="owner"');
});

test("[MER-23:web] ties the invalid field's error to its input", () => {
  const { merchantStaff } = getMessages("fr");
  const phone = render({ state: ready, invalidField: "phone" });
  expect(phone).toContain(merchantStaff.phoneError);
  expect(phone).toMatch(/<input(?=[^>]*id="staff-invite-phone")(?=[^>]*aria-invalid="true")/);
  expect(phone).toMatch(/aria-describedby="[^"]*staff-invite-phone-error/);

  const role = render({ state: ready, invalidField: "role" });
  expect(role).toContain(merchantStaff.roleError);
  expect(role).not.toContain(merchantStaff.phoneError);
});

test("[MER-23:web] disables both commands while one is in flight", () => {
  const html = render({ state: { ...ready, pending: "invite" } });
  const { merchantStaff } = getMessages("fr");
  expect(html).toContain(merchantStaff.sending);
  expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
});

test.each([
  ["invited", "invited", "status"],
  ["revoked", "revoked", "status"],
  ["already-member", "alreadyMember", "alert"],
  ["already-invited", "alreadyInvited", "alert"],
  ["delivery-unavailable", "deliveryUnavailable", "alert"],
  ["invite-error", "inviteError", "alert"],
  ["revoke-error", "revokeError", "alert"],
  ["stale", "stale", "alert"],
] as const)("[MER-23:web] announces the %s notice", (notice, key, role) => {
  const html = render({ state: { ...ready, notice } });
  expect(html).toContain(`role="${role}"`);
  expect(html).toContain(getMessages("fr").merchantStaff[key]);
});

test.each(["ar", "fr"] as const)("[MER-23:web] the %s access outcomes", (locale) => {
  const { merchantStaff } = getMessages(locale);
  const signIn = render({ state: { kind: "sign-in" } }, locale);
  expect(signIn).toContain(merchantStaff.signInRequired);
  expect(signIn).toContain(`href="/${locale}/sign-in?continue=merchant-status"`);
  expect(render({ state: { kind: "not-found" } }, locale)).toContain(merchantStaff.notFound);
  expect(render({ state: { kind: "error" } }, locale)).toContain(merchantStaff.retry);
  const changed = render({ state: { kind: "session-changed" } }, locale);
  expect(changed).toContain(merchantStaff.sessionChanged);
  expect(changed).toContain(merchantStaff.reload);
  expect(changed).not.toContain("staff-invite-phone");
});
