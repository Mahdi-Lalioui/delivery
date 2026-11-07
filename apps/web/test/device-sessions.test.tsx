import { formatAlgiersDate, formatAlgiersTime } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { getMessages, type Messages } from "@zaafran/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import LatinDeviceSessions, {
  generateMetadata as generateLatinMetadata,
} from "../src/app/[locale]/account/sessions/page";
import ArabicDeviceSessions, {
  generateMetadata as generateArabicMetadata,
} from "../src/app/ar/account/sessions/page";
import { useDeviceSessions, type DeviceSessions } from "../src/auth/use-device-sessions";
import { DeviceSessionManager } from "../src/components/device-session-manager";

vi.mock("../src/auth/use-device-sessions", () => ({ useDeviceSessions: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations({ locale, namespace }: { locale: Locale; namespace: keyof Messages }) {
    return Promise.resolve(createTranslator({ locale, namespace, messages: getMessages(locale) }));
  },
}));

const fixture: DeviceSessions = {
  view: { kind: "loading" },
  status: undefined,
  pending: false,
  retry: vi.fn(),
  revoke: vi.fn(),
  signOut: vi.fn(),
};

const current = {
  id: "019d6abc-1234-7234-8234-123456789abc",
  current: true,
  deviceName: "Safari",
  createdAt: "2026-11-06T23:30:00.000Z",
  lastSeenAt: "2026-11-07T23:30:00.000Z",
  expiresAt: "2026-11-08T00:00:00.000Z",
};

function render(overrides: Partial<DeviceSessions> = {}) {
  vi.mocked(useDeviceSessions).mockReturnValue({ ...fixture, ...overrides });
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="ar-DZ"
      timeZone="Africa/Algiers"
      messages={{ sessions: getMessages("ar").sessions }}
    >
      <DeviceSessionManager locale="ar" />
    </NextIntlClientProvider>,
  );
}

test("[AUTH-03] marks the current device, localizes Algiers times and scopes revoke to other devices", () => {
  const { sessions } = getMessages("ar");
  const other = {
    ...current,
    id: "019d6abc-1234-7234-8234-123456789def",
    current: false,
    deviceName: null,
  };
  const html = render({ view: { kind: "ready", sessions: [current, other] } });
  const instant = Date.parse(current.lastSeenAt);

  expect(html).toContain(sessions.title);
  expect(html).toContain(sessions.currentDevice);
  expect(html).toContain(sessions.unknownDevice);
  expect(html).toContain(formatAlgiersDate(instant, "ar"));
  expect(html).toContain(formatAlgiersTime(instant, "ar"));
  expect(html).toMatch(/<time dateTime="2026-11-07T23:30:00.000Z"/i);
  expect(html.match(/class="session-revoke"/g)).toHaveLength(1);
  expect(html).toContain(
    'aria-labelledby="session-revoke-' + other.id + " session-name-" + other.id + '"',
  );
  expect(html).toContain(
    '<span id="session-revoke-' + other.id + '">' + sessions.revoke + "</span>",
  );
  expect(html).toContain('<h2 id="session-name-' + other.id + '">');
  expect(html).toContain(sessions.signOutCurrent);
  expect(html).toContain(sessions.signOutAll);
});

test.each([
  ["loading", "loading"],
  ["load-error", "loadError"],
  ["unauthenticated", "unauthenticated"],
  ["signed-out", "signedOut"],
] as const)("[AUTH-03] localizes the %s device-list state", (kind, message) => {
  const html = render({ view: { kind } });
  expect(html).toContain(getMessages("ar").sessions[message]);
  expect(html).not.toContain("Safari");
  if (kind === "unauthenticated" || kind === "signed-out")
    expect(html).toContain('href="/ar/sign-in"');
  if (kind === "load-error") expect(html).toContain(getMessages("ar").sessions.retry);
});

test("[AUTH-03] presents an empty device list and announces a successful remote revocation", () => {
  const html = render({ view: { kind: "ready", sessions: [] }, status: "revoked" });
  const { sessions } = getMessages("ar");
  expect(html).toContain(sessions.empty);
  expect(html).toContain(sessions.revoked);
});

test("[AUTH-03] prevents parallel actions and reports a failed action without dropping devices", () => {
  const { sessions } = getMessages("ar");
  const pending = render({ view: { kind: "ready", sessions: [current] }, pending: true });
  expect(pending).toContain(sessions.working);
  expect(pending.match(/<button\b[^>]*\bdisabled=""/g)).toHaveLength(2);

  const failed = render({ view: { kind: "ready", sessions: [current] }, status: "action-error" });
  expect(failed).toContain(sessions.actionError);
  expect(failed).toContain("Safari");
});

const frenchParams = { params: Promise.resolve({ locale: "fr" }) };
const localizedRoutes = [
  { locale: "ar", element: <ArabicDeviceSessions />, metadata: generateArabicMetadata },
  {
    locale: "fr",
    element: <LatinDeviceSessions {...frenchParams} />,
    metadata: () => generateLatinMetadata(frenchParams),
  },
] as const;

test.each(localizedRoutes)(
  "[AUTH-03] the $locale route localizes the protected screen and preserves the language link path",
  async ({ locale, element, metadata }) => {
    vi.mocked(useDeviceSessions).mockReturnValue(fixture);
    const stream = await renderToReadableStream(element);
    await stream.allReady;
    const html = await new Response(stream).text();
    const { sessions } = getMessages(locale);

    expect(html).toContain(`<h1 id="session-title" tabindex="-1">${sessions.title}</h1>`);
    expect(html).toContain(sessions.loading);
    expect(html).toMatch(/<a\b[^>]*href="\/ar\/account\/sessions"[^>]*>العربية<\/a>/);
    expect(html).toMatch(/<a\b[^>]*href="\/fr\/account\/sessions"[^>]*>Français<\/a>/);
    await expect(metadata()).resolves.toEqual({
      title: sessions.title,
      robots: { index: false, follow: false },
    });
  },
);
