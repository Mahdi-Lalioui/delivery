import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { MenuItemScreen } from "../src/menu-item/components/menu-item-screen";
import { makeMenuItemDraft } from "../src/menu-item/item-editor";
import { useMenuItemEditor } from "../src/menu-item/use-menu-item-editor";
import type { MenuItem } from "../src/menu-item/menu-item-http";

vi.mock("../src/menu-item/use-menu-item-editor", () => ({ useMenuItemEditor: vi.fn() }));

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const categoryId = "019d6abc-1234-7234-8234-123456789001";
const itemId = "019d6abc-1234-7234-8234-123456789002";
const sessionId = "019d6abc-1234-7234-8234-123456789003";
const item = {
  itemId,
  categoryId,
  names: { ar: "طبق مشوي", fr: "Grillade" },
  descriptions: { fr: "Cuisine algérienne" },
  priceDzd: 1200,
  extraPrepMinutes: 15,
  tags: ["spicy"],
  optionGroupIds: [],
  photoId: null,
  moderationStatus: "unreviewed",
  isAvailable: false,
  soldOutUntil: "2026-11-07T22:59:59.000Z",
} satisfies MenuItem;
const { menuItem } = getMessages("ar");
const ready = { kind: "ready" as const, data: { items: [item], sessionId, revision: 4 } };
const editor = vi.mocked(useMenuItemEditor);
const defaults = {
  view: ready,
  editor: null,
  archiveTarget: null,
  pending: false,
  error: null,
  notice: null,
  focus: null,
  retry: vi.fn(),
  openEditor: vi.fn(),
  closeEditor: vi.fn(),
  changeDraft: vi.fn(),
  submitDraft: vi.fn(),
  duplicate: vi.fn(),
  setAvailability: vi.fn(),
  askArchive: vi.fn(),
  cancelArchive: vi.fn(),
  confirmArchive: vi.fn(),
};

function render(state: Partial<ReturnType<typeof useMenuItemEditor>> = {}) {
  editor.mockReturnValueOnce({ ...defaults, ...state });
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="ar-DZ" timeZone="Africa/Algiers" messages={{ menuItem }}>
      <MenuItemScreen merchantId={merchantId} categoryId={categoryId} locale="ar" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => editor.mockReset());

test("[MER-09:items] shows localized item content, whole dinars, and stock status as Algiers time", () => {
  const html = render();
  expect(html).toContain("طبق مشوي");
  expect(html).toContain("Cuisine algérienne");
  expect(html).toContain("1\u202f200 دج");
  expect(html).toContain("23:59");
  expect(html).toContain(menuItem.spicy);
  expect(html).toContain(menuItem.duplicate);
  expect(html).toMatch(new RegExp(`value="end_of_day"[^>]*>${menuItem.stockUntilDayEnd}</option>`));
  expect(html).toContain(`value="indefinite">${menuItem.stockSoldOut}</option>`);
  expect(html).not.toContain(menuItem.confirmArchive);
});

test("[MER-09:items] requires explicit archive confirmation and keeps the action local to its item", () => {
  const html = render({ archiveTarget: itemId, pending: true });
  expect(html).toContain(menuItem.confirmArchive);
  expect(html).toContain(menuItem.cancel);
  expect(html).toMatch(/<button[^>]+disabled="">[^<]+<\/button>/);
});

test("[MER-09:items] renders all language fields, numeric controls and attached-item form errors", () => {
  const html = render({
    editor: { kind: "edit", itemId, draft: makeMenuItemDraft(item), invalid: "descriptions" },
    error: "rateLimited",
  });
  for (const label of [
    menuItem.nameAr,
    menuItem.nameFr,
    menuItem.nameEn,
    menuItem.descriptionAr,
    menuItem.descriptionFr,
    menuItem.descriptionEn,
    menuItem.price,
    menuItem.prepMinutes,
  ]) {
    expect(html).toContain(label);
  }
  expect(html).toContain(menuItem.invalidDescription);
  expect(html).toContain(menuItem.rateLimited);
  expect(html).toContain('inputMode="numeric"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).not.toContain('type="file"');
});

test.each([
  ["loading", "loading"],
  ["error", "loadError"],
  ["sign-in", "signInRequired"],
  ["forbidden", "forbidden"],
  ["session-changed", "sessionChanged"],
  ["revision-conflict", "revisionConflict"],
] as const)("[MER-09:items] %s state omits private rows and drafts", (kind, message) => {
  const html = render({ view: { kind } });
  expect(html).toContain(menuItem[message]);
  expect(html).not.toContain("طبق مشوي");
  expect(html).not.toContain(menuItem.confirmArchive);
  if (kind === "sign-in") expect(html).toContain('href="/ar/sign-in?continue=merchant-status"');
  if (kind === "session-changed" || kind === "revision-conflict")
    expect(html).toContain(menuItem.reload);
});

test("[ADM-04:ui] keeps held moderation distinct from available stock", () => {
  const html = render({
    view: {
      ...ready,
      data: {
        ...ready.data,
        items: [
          {
            ...item,
            isAvailable: true,
            soldOutUntil: null,
            moderationStatus: "blocked_pending_review",
          },
        ],
      },
    },
  });
  expect(html).toContain(menuItem.moderationBlocked);
  expect(html).toMatch(new RegExp(`data-available="true">${RegExp.escape(menuItem.available)}<`));
});

test("[MER-09:items] exposes a new-item action when the category has no items", () => {
  const html = render({
    view: { ...ready, data: { ...ready.data, items: [] } },
    notice: "archived",
  });
  expect(html).toContain(menuItem.empty);
  expect(html).toContain(menuItem.newItem);
  expect(html).toContain(`role="status">${menuItem.archived}`);
  expect(html).not.toContain("<li");
});
