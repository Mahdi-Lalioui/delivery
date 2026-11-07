import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { OptionGroupScreen } from "../src/menu-option-group/components/option-group-screen";
import { createGroupDraft } from "../src/menu-option-group/option-group-editor";
import { useOptionGroupEditor } from "../src/menu-option-group/use-option-group-editor";
import type { OptionGroup } from "../src/menu-option-group/option-group-http";

vi.mock("../src/menu-option-group/use-option-group-editor", () => ({
  useOptionGroupEditor: vi.fn(),
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const optionGroupId = "019d6abc-1234-7234-8234-123456789001";
const firstId = "019d6abc-1234-7234-8234-123456789002";
const secondId = "019d6abc-1234-7234-8234-123456789003";
const sessionId = "019d6abc-1234-7234-8234-123456789004";
const group = {
  optionGroupId,
  names: { ar: "صلصات", fr: "Sauces" },
  minimum: 0,
  maximum: 2,
  options: [
    {
      optionId: firstId,
      names: { ar: "ثوم" },
      priceDeltaDzd: 0,
      isDefault: false,
      isAvailable: true,
    },
    {
      optionId: secondId,
      names: { fr: "Piquant" },
      priceDeltaDzd: 25,
      isDefault: true,
      isAvailable: false,
    },
  ],
} satisfies OptionGroup;
const restaurantName = "مطعم الاختبار";
const ready = {
  kind: "ready" as const,
  data: { sessionId, revision: 3, context: { restaurantName }, optionGroups: [group] },
};
const { menuOptionGroup } = getMessages("ar");
const editor = vi.mocked(useOptionGroupEditor);
const defaults = {
  view: ready,
  editor: null,
  pending: null,
  error: null,
  notice: null,
  focusId: null,
  retry: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  cancel: vi.fn(),
  changeDraft: vi.fn(),
  changeOption: vi.fn(),
  addOption: vi.fn(),
  removeOption: vi.fn(),
  reorderOption: vi.fn(),
  submit: vi.fn(),
};

function render(state: Partial<ReturnType<typeof useOptionGroupEditor>> = {}) {
  editor.mockReturnValueOnce({ ...defaults, ...state });
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={{ menuOptionGroup }}>
      <OptionGroupScreen merchantId={merchantId} locale="ar" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => editor.mockReset());

test("[MER-10] lists reusable named groups and opens an editor with ordered independent switches", () => {
  const html = render({ editor: { optionGroupId, draft: createGroupDraft(group), invalid: null } });
  expect(html).toContain("صلصات");
  expect(html).toContain(`<bdi>${restaurantName}</bdi>`);
  expect(html).toContain(menuOptionGroup.minimum);
  expect(html).toContain(menuOptionGroup.maximum);
  expect(html).toContain(menuOptionGroup.currency);
  expect(html).toContain(menuOptionGroup.nameAr);
  expect(html).toContain(menuOptionGroup.nameFr);
  expect(html).toContain(menuOptionGroup.nameEn);
  expect(html).toContain(menuOptionGroup.addOption);
  expect(html.indexOf(firstId)).toBeLessThan(html.indexOf(secondId));
  expect(html.match(/type="checkbox"/g)).toHaveLength(4);
  expect(html.match(/checked=""/g)).toHaveLength(2);
  expect(html).toContain(menuOptionGroup.defaultChoice);
  expect(html).toContain(menuOptionGroup.available);
});

test("[MER-10] links a price validation error to the affected option", () => {
  const html = render({
    editor: {
      optionGroupId,
      draft: createGroupDraft(group),
      invalid: { kind: "invalid", field: "optionPrice", optionKey: secondId },
    },
    error: "rateLimited",
  });
  expect(html).toContain(menuOptionGroup.invalidPrice);
  expect(html).toContain(menuOptionGroup.rateLimited);
  expect(html).toMatch(/aria-invalid="true"/);
  expect(html).toContain(
    `aria-describedby="option-group-${secondId}-currency option-group-${secondId}-price-error"`,
  );
});

test.each([
  ["loading", "loading"],
  ["error", "loadError"],
  ["sign-in", "signInRequired"],
  ["forbidden", "forbidden"],
  ["session-changed", "sessionChanged"],
  ["revision-conflict", "revisionConflict"],
] as const)("[MER-10] %s hides private group content and mutations", (kind, message) => {
  const html = render({ view: { kind } });
  expect(html).toContain(menuOptionGroup[message]);
  expect(html).not.toContain("صلصات");
  expect(html).not.toContain(menuOptionGroup.newGroup);
  if (kind === "sign-in") expect(html).toContain('href="/ar/sign-in?continue=merchant-status"');
});

test("[MER-10] keeps private actions disabled while loading group details", () => {
  const html = render({ pending: "detail" });
  expect(html).toContain(menuOptionGroup.loadingDetail);
  expect(html).toContain('aria-busy="true"');
  expect(html).toMatch(/<button[^>]+disabled=""/);
});

test("[MER-10] a new group has an editable first option and live order feedback", () => {
  const html = render({
    view: { ...ready, data: { ...ready.data, optionGroups: [] } },
    editor: { draft: createGroupDraft(), invalid: { kind: "invalid", field: "limits" } },
    notice: { kind: "movedOption", position: 1 },
  });
  expect(html).toContain(menuOptionGroup.empty);
  expect(html).toContain(`<bdi>${restaurantName}</bdi>`);
  expect(html).toContain(menuOptionGroup.createTitle);
  expect(html).toContain(menuOptionGroup.optionNames);
  expect(html).toContain(menuOptionGroup.invalidLimits);
  expect(html).toMatch(/<p[^>]*role="status">تم نقل الخيار/);
  expect(html).toMatch(/<button[^>]*disabled="">حذف الخيار/);
});
