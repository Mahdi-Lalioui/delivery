import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CheckoutSample } from "../src/admin/gallery/checkout-sample";
import { OrderConfirmed } from "../src/checkout/checkout-view";
import { parseTender, toTiming } from "../src/checkout/use-checkout";

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

test("[CUS-14] reads a cash tender in whole dinars and ignores anything else", () => {
  expect(parseTender("5 000")).toBe(5000);
  expect(parseTender("2 000")).toBe(2000);
  expect(parseTender("")).toBeUndefined();
  expect(parseTender("12.5")).toBeUndefined();
  expect(parseTender("-3")).toBeUndefined();
});

test("[CUS-13] sends ASAP or the chosen instant, including an Iftar slot", () => {
  expect(toTiming({ kind: "asap" })).toEqual({ kind: "asap" });
  const scheduledFor = "2027-02-10T18:05:00+01:00";
  expect(toTiming({ kind: "iftar", scheduledFor })).toEqual({ kind: "scheduled", scheduledFor });
});

test("[CUS-13] step 1 shows progress, the fulfilment switch and saved addresses", () => {
  const html = render("fr", <CheckoutSample mode="ready" locale="fr" />);
  expect(html).toContain('aria-current="step"');
  expect(html).toContain("Livraison");
  expect(html).toContain("À emporter");
  expect(html).toContain("Maison");
  expect(html).toContain("Nouvelle adresse");
  expect(html).toContain(">Continuer<");
});

test("[CUS-13] an empty cart offers to find a restaurant, loading shows a skeleton", () => {
  expect(render("fr", <CheckoutSample mode="empty" locale="fr" />)).toContain(
    "Votre panier est vide",
  );
  expect(render("ar", <CheckoutSample mode="loading" locale="ar" />)).toContain('role="status"');
});

test("[CUS-14] a failed quote offers a retry on the payment step", () => {
  const html = render("fr", <CheckoutSample mode="error" locale="fr" />);
  expect(html).toContain("Impossible de calculer le total");
  expect(html).toContain("Réessayer");
});

test("[ORD-01] the confirmed moment shows the order code and links to tracking", () => {
  const html = render(
    "ar",
    <OrderConfirmed
      locale="ar"
      orderId="00000000-0000-4000-8000-000000000500"
      shortCode="K7P-4QX"
      restaurant="دار يما"
      redirectMs={null}
    />,
  );
  expect(html).toContain("K7P-4QX");
  expect(html).toContain('href="/ar/orders/00000000-0000-4000-8000-000000000500"');
  expect(html).toContain("تم تأكيد الطلب");
});
