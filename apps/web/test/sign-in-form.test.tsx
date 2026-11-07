import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { usePhoneSignIn, type PhoneSignIn } from "../src/auth/use-phone-sign-in";
import { SignInForm } from "../src/components/sign-in-form";

vi.mock("../src/auth/use-phone-sign-in", () => ({ usePhoneSignIn: vi.fn() }));

const initialFlow: PhoneSignIn = {
  step: { kind: "phone" },
  phone: "",
  code: "",
  error: undefined,
  pending: undefined,
  retryRequest: false,
  resendSeconds: 0,
  canVerify: false,
  setPhone: vi.fn(),
  setCode: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  restart: vi.fn(),
};

function render(flow: Partial<PhoneSignIn> = {}, purpose: "sign_in" | "admin_sign_in" = "sign_in") {
  vi.mocked(usePhoneSignIn).mockReturnValue({ ...initialFlow, ...flow });
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="ar-DZ"
      timeZone="Africa/Algiers"
      messages={{ auth: getMessages("ar").auth }}
    >
      <SignInForm locale="ar" purpose={purpose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

test("[CUS-10] renders a labelled LTR phone input without submitting a phone in the URL", () => {
  const html = render();
  expect(html).toContain("<h1");
  expect(html).toContain(getMessages("ar").auth.title);
  expect(html).toMatch(/<form[^>]*method="post"/);
  expect(html).toMatch(/<label[^>]*for="sign-in-phone"/);
  expect(html).toMatch(/<input(?=[^>]*type="tel")(?=[^>]*dir="ltr")(?=[^>]*autoComplete="tel")/i);
});

test("[CUS-10] provides six visual slots, one accessible autofill input, and inline errors", () => {
  const html = render({
    step: { kind: "otp", phone: "+213550123456", challengeId: "otp", expiresAt: 100, resendAt: 50 },
    code: "012",
    error: "otpInvalid",
    resendSeconds: 45,
    canVerify: true,
  });
  expect(html.match(/class="auth-code-cell"/g)).toHaveLength(6);
  expect(html.match(/<input\b/g)).toHaveLength(1);
  expect(html).toContain("0550 12 34 56");
  expect(html).toMatch(/<input(?=[^>]*inputMode="numeric")(?=[^>]*autoComplete="one-time-code")/i);
  expect(html).toMatch(/aria-invalid="true"/);
  expect(html).toMatch(/aria-describedby="sign-in-code-description sign-in-error"/);
  expect(html).toContain(getMessages("ar").auth.otpInvalid);
  expect(html).toContain("45");
});

test("[AUTH-05] presents a separate authenticator challenge and restart path for admins", () => {
  const html = render(
    { step: { kind: "totp", challengeId: "totp", expiresAt: 100 }, error: "totpExpired" },
    "admin_sign_in",
  );
  const { auth } = getMessages("ar");
  expect(html).toContain(auth.totpTitle);
  expect(html).toContain(auth.totpExpired);
  expect(html).toContain(auth.restart);
  expect(html).toMatch(/<input(?=[^>]*disabled)(?=[^>]*autocomplete="off")/i);
});

test("[AUTH-03] offers a localized home link after the server has authenticated the session", () => {
  expect(render({ step: { kind: "done" } })).toMatch(/<a[^>]*href="\/ar"/);
});

test("[AUTH-02] an available SMS retry exposes the retry action and localizes delivery failure", () => {
  const { auth } = getMessages("ar");
  const html = render({
    step: { kind: "otp", phone: "+213550123456", challengeId: "otp", expiresAt: 100, resendAt: 50 },
    retryRequest: true,
    error: "otpDeliveryUnavailable",
    canVerify: true,
  });

  expect(html).toMatch(
    new RegExp(
      `<button\\b(?=[^>]*type="button")(?![^>]*\\bdisabled)[^>]*>${RegExp.escape(auth.retrySend)}</button>`,
    ),
  );
  expect(html).toContain(auth.otpDeliveryUnavailable);
});

test("[AUTH-01] the OTP form marks an in-flight verification as busy and disables duplicate actions", () => {
  const { auth } = getMessages("ar");
  const html = render({
    step: { kind: "otp", phone: "+213550123456", challengeId: "otp", expiresAt: 100, resendAt: 50 },
    code: "012345",
    pending: "verify",
    canVerify: true,
  });

  expect(html).toMatch(/<form\b[^>]*aria-busy="true"/);
  expect(html).toMatch(
    new RegExp(
      `<button\\b(?=[^>]*type="submit")(?=[^>]*\\bdisabled)[^>]*>${RegExp.escape(auth.verifyingCode)}</button>`,
    ),
  );
  expect(html).toMatch(
    new RegExp(
      `<button\\b(?=[^>]*type="button")(?=[^>]*\\bdisabled)[^>]*>${RegExp.escape(auth.resendCode)}</button>`,
    ),
  );
});

test("[AUTH-05:focus] associates the authenticator instructions with the active code field", () => {
  const html = render(
    { step: { kind: "totp", challengeId: "totp", expiresAt: 100 }, canVerify: true },
    "admin_sign_in",
  );
  expect(html).toMatch(/<p id="sign-in-code-description">/);
  expect(html).toMatch(/<input[^>]+aria-describedby="sign-in-code-description"/);
});
