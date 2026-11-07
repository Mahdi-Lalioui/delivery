import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AdminMerchantQueue } from "../src/admin/admin-merchant-queue";
import type { AdminApplication } from "../src/admin/admin-merchant-http";
import {
  useAdminMerchantQueue,
  type AdminMerchantQueueState,
} from "../src/admin/use-admin-merchant-queue";

vi.mock("../src/admin/use-admin-merchant-queue", () => ({ useAdminMerchantQueue: vi.fn() }));

const application: AdminApplication = {
  merchantId: "019d6abc-1234-7234-8234-123456789abc",
  restaurantName: "Cuisine fictive",
  ownerName: "Propriétaire fictif",
  phoneE164: "+213500000041",
  commune: {
    id: "019d6abc-1234-7234-8234-123456789def",
    nameAr: "بلدية تجريبية",
    nameFr: "Commune fictive",
  },
  pin: { latitude: 36.75, longitude: 3 },
  cuisines: ["algerian", "fried-chicken", "test-unknown"],
  rcNumber: null,
  submittedAt: "2026-11-07T12:00:00.000Z",
};

const sessionId = "019d6abc-1234-7234-8234-123456789aaa";
const ready = {
  kind: "ready",
  applications: [application],
  sessionId,
  nextCursor: application.submittedAt + "~" + application.merchantId,
} as const;

function render(overrides: Partial<AdminMerchantQueueState>, locale: "fr" | "en" = "fr") {
  vi.mocked(useAdminMerchantQueue).mockReturnValue({
    view: { kind: "loading" },
    application: undefined,
    isPaging: false,
    isSaving: false,
    notice: undefined,
    select: vi.fn(),
    refresh: vi.fn(),
    loadMore: vi.fn(),
    save: vi.fn(),
    ...overrides,
  });
  const { adminMerchant, merchant } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={{ adminMerchant, merchant }}
      timeZone="Africa/Algiers"
    >
      <AdminMerchantQueue locale={locale} />
    </NextIntlClientProvider>,
  );
}

test("[ADM-03:web] displays a localized pending table with an explicit next-page control", () => {
  const html = render({ view: ready });
  const { adminMerchant } = getMessages("fr");

  expect(html).toContain("<table");
  expect(html).toContain(application.restaurantName);
  expect(html).toContain(adminMerchant.restaurant);
  expect(html).toContain(adminMerchant.submitted);
  expect(html).toContain(adminMerchant.loadMore);
  expect(html).toContain(adminMerchant.selectApplication);
  expect(html).not.toContain(application.phoneE164);
  expect(html).not.toContain(sessionId);
});

test("[ADM-03:web] reveals only selected application details and a labelled decision form", () => {
  const html = render({ view: ready, application });
  const { adminMerchant, merchant } = getMessages("fr");

  for (const value of [
    application.ownerName,
    application.commune.nameFr,
    "36,75",
    merchant.cuisineAlgerian,
    merchant.cuisineChicken,
    "test-unknown",
    adminMerchant.notProvided,
    adminMerchant.approve,
    adminMerchant.reject,
    adminMerchant.reason,
    adminMerchant.confirm,
  ]) {
    expect(html).toContain(value);
  }

  expect(html).toMatch(/<fieldset[^>]*>/);
  expect(html.match(/type="radio"/g)).toHaveLength(2);
  expect(html).toMatch(/<label[^>]*for="admin-review-reason"/);
  expect(html).toMatch(/<textarea(?=[^>]*id="admin-review-reason")(?=[^>]*maxLength="500")/i);
  expect(html).not.toContain("checked=");
});

test("[I18N-04] formats the verified Algerian phone number in a nonwrapping LTR value", () => {
  const html = render({ view: ready, application });

  expect(html).toContain('<bdi class="admin-merchant-phone" dir="ltr">0500 00 00 41</bdi>');
  expect(html).not.toContain(application.phoneE164);
});

test("[ADM-03:web] a changed session clears review details and requires a manual refresh", () => {
  const html = render({ view: { kind: "session-changed" } });
  const { adminMerchant } = getMessages("fr");

  expect(html).toContain('role="alert"');
  expect(html).toContain(adminMerchant.sessionChanged);
  expect(html).toContain(adminMerchant.refresh);
  expect(html).not.toContain("<table");
  expect(html).not.toContain("<form");
  expect(html).not.toContain(application.ownerName);
});

test.each(["fr", "en"] as const)(
  "[ADM-03:web] the %s expired or forbidden view offers the admin-only sign-in continuation",
  (locale) => {
    const html = render({ view: { kind: "sign-in" } }, locale);
    expect(html).toContain(getMessages(locale).adminMerchant.signInRequired);
    expect(html).toContain(`href="/${locale}/sign-in?continue=admin-review"`);
    expect(html).not.toContain("<table");
  },
);

test("[ADM-03:web] reports a stale review and removes the obsolete confirmation action", () => {
  const html = render({ view: { ...ready, applications: [] }, notice: "stale" });
  const { adminMerchant } = getMessages("fr");

  expect(html).toContain('role="alert"');
  expect(html).toContain(adminMerchant.stale);
  expect(html).toContain(adminMerchant.refresh);
  expect(html).not.toContain(adminMerchant.confirm);
});

test("[ADM-03:web] announces a completed decision when the review queue becomes empty", () => {
  const html = render({
    view: { kind: "ready", applications: [], nextCursor: null, sessionId },
    notice: "approved",
  });
  const { adminMerchant } = getMessages("fr");

  expect(html).toContain('role="status"');
  expect(html).toContain(adminMerchant.approved);
  expect(html).toContain(adminMerchant.empty);
});
