import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { RecipientFields, validateRecipient } from "../src/retention/recipient";

test("[CUS-15] accepts a recipient name and Algerian mobile in any common format", () => {
  expect(
    validateRecipient({ name: "  Amina ", phone: "0555 12 34 56", shareTracking: true }),
  ).toEqual({
    kind: "ready",
    recipient: { name: "Amina", phoneE164: "+213555123456", shareTracking: true },
  });
  expect(
    validateRecipient({ name: "Karim", phone: "٠٦٦١٢٣٤٥٦٧", shareTracking: false }),
  ).toMatchObject({
    kind: "ready",
    recipient: { phoneE164: "+213661234567" },
  });
});

test("[CUS-15] rejects a missing name, a too-long name and a non-mobile number", () => {
  expect(validateRecipient({ name: " ", phone: "0555123456", shareTracking: false })).toEqual({
    kind: "invalid",
    field: "name",
  });
  expect(
    validateRecipient({ name: "x".repeat(81), phone: "0555123456", shareTracking: false }),
  ).toEqual({ kind: "invalid", field: "name" });
  expect(validateRecipient({ name: "Amina", phone: "021 23 45 67", shareTracking: false })).toEqual(
    { kind: "invalid", field: "phone" },
  );
});

test("[CUS-15] renders labelled fields with the tracking opt-in", () => {
  const { retentionRecipient } = getMessages("ar");
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="ar" messages={{ retentionRecipient }}>
      <RecipientFields
        value={{ name: "", phone: "", shareTracking: false }}
        invalidField="phone"
        onChange={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  expect(html).toContain(retentionRecipient.smsNotice);
  expect(html).toContain('role="switch"');
  expect(html).toContain(">+213<");
  expect(html).toContain(retentionRecipient.phoneError);
  expect(html.match(/<input[^>]*type="tel"[^>]*>/)?.[0]).toContain('aria-invalid="true"');
});
