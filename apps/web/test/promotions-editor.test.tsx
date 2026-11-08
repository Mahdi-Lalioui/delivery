import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { emptyPromotionDraft } from "../src/retention/promotion-draft";
import { PromotionsEditor } from "../src/retention/promotions-editor";
import { usePromotions, type PromotionsState } from "../src/retention/use-promotions";
import { promotionMockIds as ids, promotionsMockState } from "./mocks/promotions-handlers";

vi.mock("../src/retention/use-promotions", () => ({ usePromotions: vi.fn() }));

function render(overrides: Partial<PromotionsState>, locale: "ar" | "fr" | "en" = "fr") {
  vi.mocked(usePromotions).mockReturnValue({
    view: { kind: "loading" },
    draft: emptyPromotionDraft,
    editingId: undefined,
    outcome: undefined,
    isSaving: false,
    change: vi.fn(),
    edit: vi.fn(),
    save: vi.fn(),
    ...overrides,
  });
  const { retentionPromotions } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ retentionPromotions }}>
      <PromotionsEditor merchantId={ids.merchantId} />
    </NextIntlClientProvider>,
  );
}

const ready = { kind: "ready" as const, promotions: promotionsMockState().promotions };

test("[MER-19] lists promotions with uses and sales", () => {
  const html = render({ view: ready });
  expect(html).toContain("IFTAR");
  expect(html).toContain("42 utilisations");
});

test("[MER-19] shows a worked example once the discount is complete", () => {
  const { retentionPromotions } = getMessages("fr");
  expect(render({ view: ready })).toContain(retentionPromotions.exampleIncomplete);
  const draft = { ...emptyPromotionDraft, percent: "10", capDzd: "150" };
  const html = render({ view: ready, draft });
  expect(html).toContain(retentionPromotions.exampleTotal);
  expect(html).toMatch(/2.100/);
});

test("[MER-19] shows the code field only for code promotions and flags invalid fields", () => {
  const draft = { ...emptyPromotionDraft, activation: "code" as const };
  const html = render({ view: ready, draft, outcome: { invalid: "code" } }, "en");
  expect(html.match(/<input[^>]*name="code"[^>]*>/)?.[0]).toContain('aria-invalid="true"');
  expect(render({ view: ready }, "en")).not.toContain('name="code"');
  const { retentionPromotions } = getMessages("ar");
  expect(render({ view: ready, outcome: "duplicate-code" }, "ar")).toContain(
    retentionPromotions.duplicateCode,
  );
});
