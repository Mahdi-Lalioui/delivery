import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { emptyPromotionDraft } from "../src/retention/promotion-draft";
import { PromotionsView } from "../src/retention/promotions-editor";
import type { PromotionsState } from "../src/retention/use-promotions";
import { promotionsMockState } from "./mocks/promotions-handlers";

type Locale = "ar" | "fr" | "en";

function render(overrides: Partial<PromotionsState>, locale: Locale = "fr") {
  const state: PromotionsState = {
    view: { kind: "loading" },
    draft: emptyPromotionDraft,
    editingId: undefined,
    outcome: undefined,
    outcomeId: 0,
    isSaving: false,
    change: vi.fn(),
    edit: vi.fn(),
    save: vi.fn(),
    ...overrides,
  };
  const { retentionPromotions } = getMessages(locale);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{ retentionPromotions }}>
      <PromotionsView state={state} locale={locale} />
    </NextIntlClientProvider>,
  );
}

const ready = { kind: "ready" as const, promotions: promotionsMockState().promotions };

test("[MER-19] lists promotions as cards with code, type badge, uses and sales", () => {
  const html = render({ view: ready });
  expect(html).toContain("IFTAR");
  expect(html).toContain("promotion-code");
  expect(html).toContain("ui-badge-primary");
  expect(html).toContain("42 utilisations");
  expect(html).toContain("98 500 DA");
});

test("[MER-19] uses segmented controls, money fields and a toggle, and prices a worked example", () => {
  const { retentionPromotions } = getMessages("fr");
  const empty = render({ view: ready });
  expect(empty.match(/class="ui-segmented"/g)).toHaveLength(2);
  expect(empty).toContain('role="switch"');
  expect(empty).toContain(retentionPromotions.exampleIncomplete);
  const html = render({
    view: ready,
    draft: { ...emptyPromotionDraft, percent: "10", capDzd: "150" },
  });
  expect(html).toContain("ui-field-money");
  expect(html).toContain("2 100 DA");
});

test("[MER-19] shows the code field only for code promotions, flags invalid fields and has empty and loading states", () => {
  const draft = { ...emptyPromotionDraft, activation: "code" as const };
  const html = render({ view: ready, draft, outcome: { invalid: "code" } }, "en");
  expect(html.match(/<input[^>]*name="code"[^>]*>/)?.[0]).toContain('aria-invalid="true"');
  expect(render({ view: ready }, "en")).not.toContain('name="code"');
  const { retentionPromotions } = getMessages("ar");
  expect(render({ view: { kind: "ready", promotions: [] } }, "ar")).toContain(
    retentionPromotions.emptyBody,
  );
  expect(render({}, "ar")).toContain('class="ui-skeleton"');
});
