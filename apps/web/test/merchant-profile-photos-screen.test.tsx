import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { MerchantProfilePhotosScreen } from "../src/merchant-profile-photos/components/merchant-profile-photos-screen";
import { useMerchantResource } from "../src/merchant/use-merchant-resource";

vi.mock("../src/merchant/use-merchant-resource", () => ({ useMerchantResource: vi.fn() }));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const restaurantName = "مطعم افتراضي";
const messages = getMessages("ar");
const resource = vi.mocked(useMerchantResource);
const retry = vi.fn();

function render() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={messages}>
      <MerchantProfilePhotosScreen locale="ar" merchantId={merchantId} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => resource.mockReset());

test("[MER-14] renders two localized crop fields and a single disabled save for an unchanged pair", () => {
  resource.mockReturnValueOnce({
    view: {
      kind: "ready",
      data: { sessionId, revision: 3, restaurantName, coverPhotoId: null, logoPhotoId: null },
    },
    retry,
  });

  const html = render();
  expect(html).toContain(`href="/ar/merchant/${merchantId}/setup"`);
  expect(html).toContain(`<bdi>${restaurantName}</bdi>`);
  expect(html).toContain(`>${messages.merchantProfilePhotos.cover}</legend>`);
  expect(html).toContain(`>${messages.merchantProfilePhotos.logo}</legend>`);
  expect(html).toContain(messages.merchantProfilePhotos.coverDescription);
  expect(html).toContain(messages.merchantProfilePhotos.logoDescription);
  expect(html).not.toContain(messages.mediaPhoto.guide);
  expect(html.match(/type="file"/g)).toHaveLength(2);
  expect(html.match(/type="submit"/g)).toHaveLength(1);
  expect(html).toMatch(/type="submit"[^>]*disabled/);
});

test.each(["loading", "error", "forbidden", "unauthenticated"] as const)(
  "[MER-14] does not render photo controls in the %s state",
  (kind) => {
    resource.mockReturnValueOnce({ view: { kind }, retry });
    const html = render();
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('type="submit"');
  },
);
