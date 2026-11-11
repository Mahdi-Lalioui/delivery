import { getMessages } from "@zaafran/i18n/messages";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { MerchantOnboardingScreen } from "../src/merchant-onboarding/components/merchant-onboarding-screen";
import { useMerchantResource } from "../src/merchant/use-merchant-resource";

vi.mock("../src/merchant/use-merchant-resource", () => ({ useMerchantResource: vi.fn() }));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const restaurantName = "مطعم افتراضي";
const resource = vi.mocked(useMerchantResource);
const retry = vi.fn();

function render() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={getMessages("ar")}>
      <MerchantOnboardingScreen merchantId={merchantId} locale="ar" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => resource.mockReset());

test.each([
  ["complete", 3],
  ["incomplete", 5],
] as const)(
  "[MER-02] displays persisted %s hours and menu progress %d without activating Go live",
  (hours, count) => {
    resource.mockReturnValueOnce({
      view: {
        kind: "ready",
        data: {
          sessionId,
          merchantId,
          restaurantName,
          steps: {
            profile: "complete",
            hours,
            menu: { itemsTowardMinimum: count, requiredItems: 5 },
            deliveryZone: "unavailable",
            testOrder: "unavailable",
          },
          canGoLive: false,
        },
      },
      retry,
    });
    const html = render();
    const { merchantOnboarding } = getMessages("ar");
    const translate = createTranslator({
      locale: "ar-DZ",
      namespace: "merchantOnboarding",
      messages: { merchantOnboarding },
    });

    expect(html).toContain(restaurantName);
    expect(html).toContain(merchantOnboarding.profile);
    expect(html).toContain(merchantOnboarding.hours);
    expect(html).toMatch(
      new RegExp(
        `<h3>${RegExp.escape(merchantOnboarding.hours)}</h3><span[^>]*>${RegExp.escape(merchantOnboarding[hours])}</span>`,
      ),
    );
    expect(html).toMatch(
      new RegExp(
        `<progress(?=[^>]*value="${String(count)}")(?=[^>]*max="5")(?=[^>]*aria-labelledby="setup-menu-title")`,
      ),
    );
    expect(html).toContain(translate("menuProgress", { completed: String(count), required: "5" }));
    expect(html).toContain(`href="/ar/merchant/${merchantId}/menu"`);
    expect(html).toContain(`href="/ar/merchant/${merchantId}/profile/photos"`);
    expect(html).toContain(getMessages("ar").merchantProfilePhotos.manage);
    expect(html).toContain(merchantOnboarding.deliveryZone);
    expect(html).toContain(merchantOnboarding.testOrder);
    expect(html).toContain(merchantOnboarding.goLive);
    expect(
      html.match(new RegExp(`>${RegExp.escape(merchantOnboarding.unavailable)}<`, "g")),
    ).toHaveLength(3);
    expect(html).not.toContain("<button");
  },
);

test.each([
  ["loading", "loading"],
  ["error", "loadError"],
  ["unauthenticated", "signInRequired"],
  ["forbidden", "forbidden"],
] as const)(
  "[MER-02] localizes the %s state without rendering private checklist data",
  (kind, message) => {
    resource.mockReturnValueOnce({ view: { kind }, retry });
    const html = render();
    const { merchantOnboarding } = getMessages("ar");

    expect(html).toContain(merchantOnboarding[message]);
    expect(html).not.toContain(restaurantName);
    expect(html).not.toContain("<progress");
    if (kind === "unauthenticated")
      expect(html).toContain('href="/ar/sign-in?continue=merchant-status"');
    if (kind === "error") expect(html).toContain(merchantOnboarding.retry);
  },
);
