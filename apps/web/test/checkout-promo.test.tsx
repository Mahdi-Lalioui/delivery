import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { CheckoutSample } from "../src/admin/gallery/checkout-sample";
import { requestQuote } from "../src/checkout/checkout-http";

function render(locale: "fr" | "ar", node: ReactNode) {
  const messages = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale === "ar" ? "ar-DZ" : "fr-DZ"}
      timeZone="Africa/Algiers"
      messages={{ checkout: messages.checkout, retentionScheduling: messages.retentionScheduling }}
    >
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const input = {
  merchantId: "019d6abc-1234-7234-8234-123456789000",
  fulfilment: "pickup" as const,
  timing: { kind: "asap" as const },
  promotionCode: "RAMADAN",
  items: [{ itemId: "019d6abc-1234-7234-8234-123456789001", quantity: 1, optionIds: [] }],
};

function problem(code: string) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        code,
        requestId: "req-1",
      }),
      {
        status: 400,
        headers: { "content-type": "application/problem+json" },
      },
    ),
  );
}

test("[MON-03] a refused code comes back as its reason, not as a broken checkout", async () => {
  vi.stubGlobal("fetch", () => problem("promotion_below_minimum"));
  expect(await requestQuote(input)).toEqual({
    kind: "promotion",
    rejection: "promotion_below_minimum",
  });
  vi.stubGlobal("fetch", () => problem("validation_failed"));
  expect(await requestQuote(input)).toEqual({ kind: "error" });
});

test("[MON-03] an applied code shows as a saving the server computed, with a way to remove it", () => {
  const html = render(
    "fr",
    <CheckoutSample mode="ready" locale="fr" initialView="3" promo="code" />,
  );
  expect(html).toContain("Réduction");
  expect(html).toContain("RAMADAN");
  expect(html).toContain("−300 DA");
  expect(html).toContain("Retirer le code");
  expect(html).toContain("2 800 DA");
});

test("[MON-03] an automatic offer is named as the restaurant's, with no code field opened", () => {
  const html = render(
    "ar",
    <CheckoutSample mode="ready" locale="ar" initialView="3" promo="automatic" />,
  );
  expect(html).toContain("عرض المطعم");
  expect(html).toContain("إضافة رمز ترويجي");
});

test("[MON-03] a refused code keeps the field open and says what to do next", () => {
  const html = render(
    "fr",
    <CheckoutSample mode="ready" locale="fr" initialView="3" promo="rejected" />,
  );
  expect(html).toContain("Ce code a expiré. Essayez-en un autre ou commandez sans.");
  expect(html).not.toContain("Réduction");
});
