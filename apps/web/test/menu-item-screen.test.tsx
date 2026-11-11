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
const { menuItem, menuPrice, mediaPhoto, menuPreview } = getMessages("ar");
const ready = {
  kind: "ready" as const,
  data: {
    items: [item],
    sessionId,
    revision: 4,
    context: {
      restaurantName: "Restaurant fictif",
      categoryNames: { ar: "قسم تجريبي", fr: "Catégorie fictive" },
    },
  },
};
const editor = vi.mocked(useMenuItemEditor);
const defaults = {
  view: ready,
  editor: null,
  inlinePrice: null,
  openPrice: vi.fn(),
  changePrice: vi.fn(),
  cancelPrice: vi.fn(),
  submitPrice: vi.fn(),
  attachments: { kind: "loading" } as const,
  retryAttachments: vi.fn(),
  updateAttachments: vi.fn(),
  archiveTarget: null,
  pending: false,
  error: null,
  notice: null,
  focus: null,
  retry: vi.fn(),
  onRailAccessChanged: vi.fn(),
  openEditor: vi.fn(),
  closeEditor: vi.fn(),
  changeDraft: vi.fn(),
  submitDraft: vi.fn(),
  duplicate: vi.fn(),
  setAvailability: vi.fn(),
  askArchive: vi.fn(),
  cancelArchive: vi.fn(),
  confirmArchive: vi.fn(),
  reloadAfter: vi.fn(),
};

function render(state: Partial<ReturnType<typeof useMenuItemEditor>> = {}) {
  editor.mockReturnValueOnce({ ...defaults, ...state });
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="ar-DZ"
      timeZone="Africa/Algiers"
      messages={{ menuItem, menuPrice, mediaPhoto, menuPreview }}
    >
      <MenuItemScreen merchantId={merchantId} categoryId={categoryId} locale="ar" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => editor.mockReset());

test("[MER-09:items] shows localized item content, whole dinars, and stock status as Algiers time", () => {
  const html = render();
  expect(html).toContain("طبق مشوي");
  expect(html).toContain("<bdi>Restaurant fictif</bdi>");
  expect(html).toContain("<bdi>قسم تجريبي</bdi>");
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
  expect(html).toContain('type="file"');
  expect(html).toContain(mediaPhoto.choose);
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
  expect(html).not.toContain("Restaurant fictif");
  expect(html).not.toContain("قسم تجريبي");
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
  expect(html).toContain(menuItem.moderationBlockedHint);
  expect(html).toMatch(new RegExp(`data-available="true">${RegExp.escape(menuItem.available)}<`));
  expect(render({ view: ready })).not.toContain(menuItem.moderationBlockedHint);
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

const firstGroupId = "019d6abc-1234-7234-8234-123456789021";
const secondGroupId = "019d6abc-1234-7234-8234-123456789022";
const thirdGroupId = "019d6abc-1234-7234-8234-123456789023";
const unknownGroupId = "019d6abc-1234-7234-8234-123456789024";
const editWithAttachments = {
  kind: "edit" as const,
  itemId,
  draft: {
    ...makeMenuItemDraft(item),
    optionGroupIds: [secondGroupId, unknownGroupId, firstGroupId],
  },
  invalid: null,
};
const groups = [
  { optionGroupId: firstGroupId, names: { ar: "صلصات" }, minimum: 0, maximum: 2 },
  { optionGroupId: secondGroupId, names: { fr: "Pain" }, minimum: 1, maximum: 1 },
  { optionGroupId: thirdGroupId, names: { fr: "Desserts" }, minimum: 0, maximum: 2 },
];

test("[MER-10:attachments] renders saved order and allows keyboard attachment and movement", () => {
  const html = render({
    editor: editWithAttachments,
    attachments: { kind: "ready", optionGroups: groups },
  });

  const attached = html.match(/<ol[^>]*>[\s\S]+?<\/ol>/)?.[0] ?? "";
  expect(attached).toMatch(new RegExp(`Pain.*${menuItem.optionGroupUnknown}.*صلصات`));
  expect(html).toContain(menuItem.optionGroupsAvailable);
  expect(html).toMatch(new RegExp(`value="${thirdGroupId}"[^>]*>Desserts<`));
  expect(html).not.toMatch(new RegExp(`value="${secondGroupId}"[^>]*>Pain<`));
  expect(html).toContain(menuItem.optionGroupsAdd);
  expect(html).toContain(menuItem.optionGroupsRemove.replace("{name}", "Pain"));
  expect(html).toContain(menuItem.optionGroupsEarlier.replace("{name}", "صلصات"));
  expect(html).toContain(menuItem.optionGroupsLater.replace("{name}", "Pain"));
});

test("[MER-10:attachments] blocks stale and pending saves and preserves unrelated edits on failure", () => {
  const stale = render({ editor: editWithAttachments, attachments: { kind: "revision-conflict" } });
  const pending = render({ editor: editWithAttachments, attachments: { kind: "loading" } });
  const error = render({ editor: editWithAttachments, attachments: { kind: "error" } });

  for (const html of [stale, pending]) {
    expect(html).toMatch(/<button(?=[^>]*id="menu-item-save")(?=[^>]*disabled="")/);
  }
  expect(stale).toContain(menuItem.revisionConflict);
  expect(stale).toContain(menuItem.reload);
  expect(error).toContain(menuItem.optionGroupsLoadError);
  expect(error).toContain(menuItem.optionGroupsRetry);
  expect(error).not.toMatch(/<button(?=[^>]*id="menu-item-save")(?=[^>]*disabled="")/);
});

test("[MER-09:inline-price] offers an item-specific price editing button next to the saved price", () => {
  const html = render();
  const label = menuItem.editPriceLabel.replace("{name}", "طبق مشوي");
  expect(html).toMatch(
    new RegExp(
      `<button(?=[^>]*id="menu-item-edit-price-${itemId}")(?=[^>]*aria-label="${RegExp.escape(label)}")`,
    ),
  );
  expect(html).toContain("1\u202f200 دج");
  expect(html).not.toContain(`id="menu-item-price-input-${itemId}"`);
});

test("[MER-09:inline-price] renders the inline form, its currency and validation, and disables other actions", () => {
  const html = render({ inlinePrice: { itemId, value: "12.5", invalid: true } });
  const label = menuItem.inlinePriceLabel.replace("{name}", "طبق مشوي");
  expect(html).toMatch(
    new RegExp(
      `<input(?=[^>]*id="menu-item-price-input-${itemId}")(?=[^>]*aria-invalid="true")(?=[^>]*inputMode="numeric")(?=[^>]*value="12.5")`,
    ),
  );
  expect(html).toContain(label);
  expect(html).toContain(menuItem.invalidPrice);
  expect(html).toContain(menuItem.currency);
  expect(html).toMatch(
    new RegExp(`<button(?=[^>]*id="menu-item-duplicate-${itemId}")(?=[^>]*disabled="")`),
  );
  expect(html).toMatch(
    new RegExp(`<select(?=[^>]*id="menu-item-availability-${itemId}")(?=[^>]*disabled="")`),
  );
  expect(html).not.toContain(`id="menu-item-edit-price-${itemId}"`);
});

test.each([{ editor: editWithAttachments }, { archiveTarget: itemId }])(
  "[MER-09:inline-price] leaves inline editing disabled during drawer or archive actions",
  (state) => {
    const html = render(state);
    expect(html).toMatch(
      new RegExp(`<button(?=[^>]*id="menu-item-edit-price-${itemId}")(?=[^>]*disabled="")`),
    );
  },
);

test("[MER-11] places the bulk price panel in the item workspace with localized items", () => {
  const html = render();
  expect(html).toContain(`id="bulk-price-title">${menuPrice.title}`);
  expect(html).toContain(`id="bulk-price-item-${itemId}"`);
  expect(html).toMatch(/<bdi>طبق مشوي<\/bdi><bdi class="bulk-price-current">/);
  expect(html).not.toMatch(/<fieldset class="bulk-price-fieldset" disabled/);
});

test("[MER-11] hides the bulk price panel when the category has no items", () => {
  const html = render({ view: { ...ready, data: { ...ready.data, items: [] } } });
  expect(html).not.toContain("bulk-price-title");
});

test("[MER-11] locks the bulk price panel while an item form is open", () => {
  const html = render({ editor: editWithAttachments });
  expect(html).toMatch(/<fieldset class="bulk-price-fieldset" disabled/);
});

test("[ADM-04] exposes a closed customer preview while leaving the editor visible", () => {
  const html = render();
  expect(html).toContain(menuPreview.open);
  expect(html).toContain('aria-expanded="false" aria-controls="menu-preview"');
  expect(html).toContain('id="menu-item-list-title"');
});
