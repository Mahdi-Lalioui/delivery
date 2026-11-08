import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ShareKit } from "../src/retention/share-kit";

const posters = {
  ar: { headline: "اطلب", scan: "امسح", dir: "rtl" as const, lang: "ar" as const },
  fr: { headline: "Commandez", scan: "Scannez", dir: "ltr" as const, lang: "fr" as const },
};

test("[MER-24] waits for the browser origin before drawing the QR code", () => {
  const { retentionShare } = getMessages("fr");
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{ retentionShare }}>
      <ShareKit merchantId="019d6abc-0000-7000-8000-000000000002" posters={posters} />
    </NextIntlClientProvider>,
  );
  expect(html).toContain(retentionShare.loading);
  expect(html).not.toContain("<svg");
});
