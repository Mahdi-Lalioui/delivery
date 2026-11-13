import { brand } from "@zaafran/config/brand";
import { menuImportColumns } from "@zaafran/contracts/menu-import";
import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MenuImportPanel } from "../src/menu-import/components/menu-import-panel";
import type { MenuImportControls } from "../src/menu-import/import-controls";

const sessionId = "019d6abc-1234-7234-8234-123456789001";
const merchantId = "019d6abc-1234-7234-8234-123456789002";
const token = "a".repeat(43);
const row = {
  external_key: "plat-001",
  category_ar: "أطباق",
  category_fr: "Plats",
  name_ar: "شوربة",
  name_fr: "Chorba fictive",
  name_en: "Soup",
  description_ar: "شوربة بالقمح",
  description_fr: "Soupe de blé",
  description_en: "Wheat soup",
  price_dzd: "450",
};
const draft = {
  fileId: "test-file",
  merchantId,
  sessionId,
  input: { rows: [row], expectedRevision: 3 },
};
const summary = { categoriesCreated: 1, itemsCreated: 1, itemsUpdated: 0, itemsUnchanged: 0 };
const preview = { sessionId, revision: 3, errors: [], summary, previewToken: token };

function render(overrides: Partial<MenuImportControls> = {}, locale: "ar" | "fr" | "en" = "fr") {
  const controls: MenuImportControls = {
    state: { kind: "editing" },
    pending: false,
    fileName: null,
    fileError: null,
    chooseFile: vi.fn(),
    preview: vi.fn(),
    apply: vi.fn(),
    reset: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Africa/Algiers"
      messages={{ menuImport: getMessages(locale).menuImport }}
    >
      <MenuImportPanel locale={locale} controls={controls} />
    </NextIntlClientProvider>,
  );
}

test("[MER-12:ui] offers a labelled CSV/XLSX chooser and a downloadable canonical template", () => {
  const html = render();
  const { menuImport } = getMessages("fr");
  expect(html).toContain(menuImport.title);
  expect(html).toMatch(/<label[^>]+for="menu-import-file"/);
  expect(html).toMatch(/<input(?=[^>]*type="file")(?=[^>]*accept="[^"]*\.csv[^"]*\.xlsx)/);
  expect(html).toContain(menuImport.fileHint);
  expect(html).toMatch(
    new RegExp(
      `<a(?=[^>]*download="${brand.name.toLowerCase()}-menu-template\\.csv")(?=[^>]*href="data:text/csv)`,
    ),
  );
  const href = html.match(/href="(data:text\/csv[^"]+)"/)?.[1];
  if (!href) throw new Error("Expected a CSV template");
  const csv = decodeURIComponent(href.slice(href.indexOf(",") + 1));
  expect(csv.replace(/^\uFEFF/, "")).toBe(menuImportColumns.join(",") + "\r\n");
  expect(html).toMatch(/<button(?=[^>]*id="menu-import-apply")(?=[^>]*disabled="")/);
});

test("[MER-12:ui] previews bilingual raw cells without losing the external key or description", () => {
  const html = render({ state: { kind: "review", draft }, fileName: "menu fictif.csv" });
  for (const value of [
    row.external_key,
    row.category_ar,
    row.category_fr,
    row.name_ar,
    row.name_fr,
    row.name_en,
    row.description_ar,
    row.description_fr,
    row.description_en,
  ]) {
    expect(html).toContain(value);
  }
  expect(html).toMatch(/<bdi(?=[^>]*lang="ar")(?=[^>]*dir="rtl")/);
  expect(html).toMatch(/<bdi(?=[^>]*lang="fr")(?=[^>]*dir="ltr")/);
  expect(html).toContain("450");
  expect(html).toContain("menu fictif.csv");
  expect(html).toMatch(/<button(?=[^>]*id="menu-import-apply")(?=[^>]*disabled="")/);
});

test("[MER-12:ui] enables apply only after a successful server preview supplies its token", () => {
  const ready = render({ state: { kind: "previewed", draft, preview } });
  const { menuImport } = getMessages("fr");
  expect(ready).toContain(menuImport.summaryCaption);
  expect(ready).toContain(menuImport.categoriesCreated);
  expect(ready).toContain(menuImport.itemsUpdated);
  expect(ready).not.toMatch(/<button(?=[^>]*id="menu-import-apply")(?=[^>]*disabled="")/);
  expect(ready).not.toContain(token);

  const invalidPreview = {
    ...preview,
    previewToken: null,
    errors: [{ row: 2, field: "price_dzd" as const, reason: "invalid_price" as const }],
  };
  const invalid = render({ state: { kind: "previewed", draft, preview: invalidPreview } });
  expect(invalid).toContain(menuImport.errorsCaption);
  expect(invalid).toContain(menuImport.fields.price_dzd);
  expect(invalid).toContain(menuImport.reasons.invalid_price);
  expect(invalid).toMatch(/<th[^>]*scope="row"[^>]*>2<\/th>/);
  expect(invalid).toMatch(/<button(?=[^>]*id="menu-import-apply")(?=[^>]*disabled="")/);
});

test("[MER-12:ui] prevents concurrent file changes and duplicate applies while processing", () => {
  const html = render({
    state: { kind: "applying", draft, preview, idempotencyKey: "pending-key" },
    pending: true,
  });
  expect(html).toContain(getMessages("fr").menuImport.applying);
  expect(html).toContain('aria-busy="true"');
  expect(html).toMatch(/<input(?=[^>]*id="menu-import-file")(?=[^>]*disabled="")/);
  expect(html).toMatch(/<button(?=[^>]*id="menu-import-apply")(?=[^>]*disabled="")/);
});

test("[MER-12:ui] announces success with the committed counts and a new-import action", () => {
  const html = render({ state: { kind: "applied", result: { revision: 4, summary } } });
  const { menuImport } = getMessages("fr");
  expect(html).toContain(menuImport.applied);
  expect(html).toContain('role="status"');
  expect(html).toContain(menuImport.newImport);
  expect(html).not.toContain(row.name_fr);
  expect(html).toMatch(/<button(?=[^>]*id="menu-import-apply")(?=[^>]*disabled="")/);
});

test.each(["ar", "fr", "en"] as const)(
  "[MER-12:ui] localizes an invalid workbook in %s without exposing raw parser errors",
  (locale) => {
    const html = render({ fileName: "fictive.xlsx", fileError: "unsafe_workbook" }, locale);
    expect(html).toContain('role="alert"');
    expect(html).toContain(getMessages(locale).menuImport.fileErrors.unsafe_workbook);
    expect(html).toMatch(/<input(?=[^>]*id="menu-import-file")(?=[^>]*aria-invalid="true")/);
  },
);
