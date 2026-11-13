import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { MenuPreviewScreen } from "../src/menu-preview/components/menu-preview-screen";
import { useMerchantResource } from "../src/merchant/use-merchant-resource";

vi.mock("../src/merchant/use-merchant-resource", () => ({ useMerchantResource: vi.fn() }));

const merchantId = "019d6abc-1234-7234-8234-123456789020";
const resource = vi.mocked(useMerchantResource);
const retry = vi.fn();
const preview = {
  revision: 1,
  restaurantName: "مطعم افتراضي",
  categories: [
    {
      categoryId: "019d6abc-1234-7234-8234-123456789021",
      names: { ar: "أطباق" },
      items: [
        {
          itemId: "019d6abc-1234-7234-8234-123456789022",
          names: { ar: "كسكس" },
          descriptions: { ar: "وصف" },
          priceDzd: 700,
          tags: [],
          isAvailable: true,
          soldOutUntil: null,
        },
      ],
    },
  ],
};

function render() {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="ar-DZ"
      timeZone="Africa/Algiers"
      messages={{ menuPreview: getMessages("ar").menuPreview }}
    >
      <MenuPreviewScreen merchantId={merchantId} locale="ar" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => resource.mockReset());

test("[ADM-04] shows the restaurant name, title and listable items once loaded", () => {
  resource.mockReturnValueOnce({ view: { kind: "ready", data: preview }, retry });
  const { menuPreview } = getMessages("ar");
  const html = render();

  expect(html).toContain(`<h1 id="menu-preview-title" tabindex="-1">${menuPreview.title}</h1>`);
  expect(html).toContain("<bdi>مطعم افتراضي</bdi>");
  expect(html).toContain("<bdi>كسكس</bdi>");
  expect(html).toContain(`href="/ar/merchant/${merchantId}/menu"`);
});

test.each([
  ["loading", "loading"],
  ["unauthenticated", "signInRequired"],
  ["forbidden", "forbidden"],
  ["error", "loadError"],
] as const)("[ADM-04] explains the %s state", (kind, message) => {
  resource.mockReturnValueOnce({ view: { kind }, retry });
  const { menuPreview } = getMessages("ar");
  const html = render();

  expect(html).toContain(menuPreview[message]);
  expect(html).not.toContain("menu-preview-categories");
});
