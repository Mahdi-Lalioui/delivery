import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { StaffAcceptScreen } from "../src/merchant-staff/components/staff-accept-screen";
import { readInvitationToken } from "../src/merchant-staff/staff-accept";
import { useStaffAccept, type StaffAcceptView } from "../src/merchant-staff/use-staff-accept";

vi.mock("../src/merchant-staff/use-staff-accept", () => ({ useStaffAccept: vi.fn() }));

const token = `${"a".repeat(42)}A`;

function render(view: StaffAcceptView, locale: "ar" | "fr" = "fr") {
  vi.mocked(useStaffAccept).mockReturnValue({ view, retry: vi.fn() });
  const { merchantStaff } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ merchantStaff }}>
      <StaffAcceptScreen locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[MER-23:web] reads only a well-formed token from the link fragment", () => {
  expect(readInvitationToken(`#token=${token}`)).toBe(token);
  expect(readInvitationToken(`#other=1&token=${token}`)).toBe(token);
  expect(readInvitationToken("")).toBeUndefined();
  expect(readInvitationToken("#token=short")).toBeUndefined();
  expect(readInvitationToken(`#token=${token}x`)).toBeUndefined();
});

test.each(["ar", "fr"] as const)(
  "[MER-23:web] the %s accepted view names the restaurant",
  (locale) => {
    const html = render(
      { kind: "accepted", restaurantName: "Cuisine fictive", role: "staff" },
      locale,
    );
    const { merchantStaff } = getMessages(locale);
    expect(html).toContain('role="status"');
    expect(html).toContain("<bdi>Cuisine fictive</bdi>");
    expect(html).toContain(merchantStaff.roleStaff);
    expect(html).toContain(`href="/${locale}/merchant"`);
  },
);

test("[MER-23:web] a signed-out invitee is sent to sign in and back", () => {
  const html = render({ kind: "sign-in" });
  expect(html).toContain(getMessages("fr").merchantStaff.acceptSignIn);
  expect(html).toContain('href="/fr/sign-in?continue=staff-accept"');
});

test.each([
  ["missing", "acceptMissing"],
  ["not-found", "acceptNotFound"],
  ["already-member", "alreadyMember"],
] as const)("[MER-23:web] explains a %s invitation and links to the restaurants", (kind, key) => {
  const html = render({ kind });
  expect(html).toContain(getMessages("fr").merchantStaff[key]);
  expect(html).toContain('href="/fr/merchant"');
});

test("[MER-23:web] offers a retry after an uncertain failure and announces progress", () => {
  const failed = render({ kind: "error" });
  expect(failed).toContain('role="alert"');
  expect(failed).toContain(getMessages("fr").merchantStaff.retry);
  const accepting = render({ kind: "accepting" });
  expect(accepting).toContain(getMessages("fr").merchantStaff.accepting);
});
