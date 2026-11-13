import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MenuCategoryScreen } from "../src/menu-category/components/menu-category-screen";
import {
  useMenuCategoryEditor,
  type MenuCategoryEditor,
} from "../src/menu-category/use-menu-category-editor";

vi.mock("../src/menu-category/use-menu-category-editor", () => ({
  useMenuCategoryEditor: vi.fn(),
}));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const first = {
  categoryId: "019d6abc-1234-7234-8234-123456789003",
  names: { ar: "إفطار", fr: "Petit déjeuner" },
  availability: null,
  position: 0,
};
const second = {
  categoryId: "019d6abc-1234-7234-8234-123456789004",
  names: { ar: "عشاء", fr: "Dîner" },
  availability: { from: "21:00", to: "03:00" },
  position: 1,
};
const controls: MenuCategoryEditor = {
  view: {
    kind: "ready",
    data: {
      sessionId,
      revision: 3,
      categories: [first, second],
      context: { restaurantName: "Restaurant fictif" },
    },
  },
  draft: { ar: "", fr: "Draft private text", en: "", from: "", to: "" },
  selectedId: undefined,
  fieldError: undefined,
  saveError: undefined,
  isSaving: false,
  revisionConflict: false,
  notice: undefined,
  focus: undefined,
  edit: vi.fn(),
  update: vi.fn(),
  reload: vi.fn(),
  save: vi.fn(),
  move: vi.fn(),
};

function render(override: Partial<MenuCategoryEditor> = {}) {
  vi.mocked(useMenuCategoryEditor).mockReturnValue({ ...controls, ...override });
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="ar-DZ"
      timeZone="Africa/Algiers"
      messages={{ menuCategory: getMessages("ar").menuCategory }}
    >
      <MenuCategoryScreen merchantId={merchantId} locale="ar" />
    </NextIntlClientProvider>,
  );
}

test("[MER-09:categories] exposes accessible category editing, reorder controls and overnight time in Arabic", () => {
  const html = render();
  const { menuCategory } = getMessages("ar");
  expect(html).toContain(menuCategory.title);
  expect(html).toContain("<bdi>Restaurant fictif</bdi>");
  expect(html).toContain(menuCategory.nameAr);
  expect(html).toContain(menuCategory.nameFr);
  expect(html).toContain(menuCategory.nameEn);
  expect(html).toContain(first.names.ar);
  expect(html).toContain(second.names.ar);
  expect(html).toContain(menuCategory.moveUp);
  expect(html).toContain(menuCategory.moveDown);
  expect(html).toContain(`href="/ar/merchant/${merchantId}/menu/${first.categoryId}/items"`);
  expect(html).toContain(menuCategory.manageItems);
  expect(html).toContain(`href="/ar/merchant/${merchantId}/menu/options"`);
  expect(html).toContain(menuCategory.optionLibrary);
  expect(html).toContain(`href="/ar/merchant/${merchantId}/menu/preview"`);
  expect(html).toContain(menuCategory.customerPreview);
  expect(html).toContain("21:00");
  expect(html).toContain("03:00");
  expect(html).toMatch(/<li\b(?=[^>]*data-category-id=)(?=[^>]*tabindex="-1")/i);
});

test("[MER-09:categories] a changed session removes private rows and drafts and offers explicit reload", () => {
  const html = render({ view: { kind: "session-changed" } });
  const { menuCategory } = getMessages("ar");
  expect(html).toContain(menuCategory.sessionChanged);
  expect(html).toContain(menuCategory.reload);
  expect(html).not.toContain(first.names.ar);
  expect(html).not.toContain(controls.draft.fr);
  expect(html).not.toContain("/menu/options");
  expect(html).not.toContain("/menu/preview");
  expect(html).not.toContain("<form");
});

test("[MER-09:categories] an expired editor links back through sign-in without exposing the menu", () => {
  const html = render({ view: { kind: "sign-in" } });
  expect(html).toContain('href="/ar/sign-in?continue=merchant-status"');
  expect(html).not.toContain(first.names.ar);
  expect(html).not.toContain("<form");
});

test("[MER-09:categories] a stale revision preserves the draft but locks writes until reload", () => {
  const html = render({ revisionConflict: true });
  const { menuCategory } = getMessages("ar");
  expect(html).toContain(menuCategory.revisionConflict);
  expect(html).toContain(menuCategory.reload);
  expect(html).toContain(controls.draft.fr);
  expect(html).toMatch(/<button\b(?=[^>]*type="submit")(?=[^>]*\bdisabled)/);
});

test("[MER-09:categories] the persisted move is announced using the localized category name and Latin digits", () => {
  const html = render({
    notice: { kind: "moved", categoryId: second.categoryId, position: 2, total: 2 },
  });
  expect(html).toMatch(/<p[^>]*role="status"[^>]*>[^<]*عشاء[^<]*2[^<]*2/u);
});

test.each([
  ["loading", "loading"],
  ["forbidden", "forbidden"],
  ["error", "loadError"],
  ["revision-conflict", "revisionConflict"],
] as const)(
  "[MER-09:categories] renders the localized %s read state without tenant data",
  (kind, message) => {
    const html = render({ view: { kind } });
    expect(html).toContain(getMessages("ar").menuCategory[message]);
    expect(html).not.toContain(first.names.ar);
    expect(html).not.toContain("<form");
  },
);

test("[MER-09:categories] an empty menu offers category creation and announces a successful save", () => {
  const html = render({
    view: { kind: "ready", data: { sessionId, revision: 3, categories: [] } },
    notice: { kind: "created" },
  });
  const { menuCategory } = getMessages("ar");
  expect(html).toContain(menuCategory.empty);
  expect(html).toContain(menuCategory.createTitle);
  expect(html).toContain(menuCategory.created);
});
