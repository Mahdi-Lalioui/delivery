import type { menuImportInput, menuImportPreviewOutput } from "@zaafran/contracts/menu-import";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";

type Row = ReturnType<typeof menuImportInput.parse>["rows"][number];
type Preview = ReturnType<typeof menuImportPreviewOutput.parse>;
type LocalizedCell = { ar?: string | undefined; fr?: string | undefined; en?: string | undefined };

const languages = [
  { language: "ar", direction: "rtl" },
  { language: "fr", direction: "ltr" },
  { language: "en", direction: "ltr" },
] as const;

function TranslatedCell({ values }: { values: LocalizedCell }) {
  return (
    <div className="menu-import-translations">
      {languages.map(({ language, direction }) => {
        const value = values[language];
        return value ? (
          <bdi key={language} lang={language} dir={direction}>
            {value}
          </bdi>
        ) : null;
      })}
    </div>
  );
}

export function ImportRowTable({ rows, locale }: { rows: readonly Row[]; locale: Locale }) {
  const translate = useTranslations("menuImport");
  const number = new Intl.NumberFormat(locale, { numberingSystem: "latn", useGrouping: false });
  return (
    <div
      className="menu-import-scroll"
      role="region"
      aria-labelledby="menu-import-rows"
      tabIndex={0}
    >
      <table className="menu-import-table">
        <caption id="menu-import-rows">{translate("previewCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{translate("previewRow")}</th>
            <th scope="col">{translate("previewKey")}</th>
            <th scope="col">{translate("previewCategory")}</th>
            <th scope="col">{translate("previewName")}</th>
            <th scope="col">{translate("previewDescription")}</th>
            <th scope="col">{translate("previewPrice")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <th scope="row">{number.format(index + 2)}</th>
              <td>
                <bdi dir="ltr">{row.external_key}</bdi>
              </td>
              <td>
                <TranslatedCell values={{ ar: row.category_ar, fr: row.category_fr }} />
              </td>
              <td>
                <TranslatedCell values={{ ar: row.name_ar, fr: row.name_fr, en: row.name_en }} />
              </td>
              <td>
                <TranslatedCell
                  values={{
                    ar: row.description_ar,
                    fr: row.description_fr,
                    en: row.description_en,
                  }}
                />
              </td>
              <td className="menu-import-price">
                <bdi>
                  {row.price_dzd} {translate("currency")}
                </bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportErrorTable({
  errors,
  locale,
}: {
  errors: Preview["errors"];
  locale: Locale;
}) {
  const translate = useTranslations("menuImport");
  const number = new Intl.NumberFormat(locale, { numberingSystem: "latn", useGrouping: false });

  return (
    <div
      className="menu-import-scroll"
      role="region"
      aria-labelledby="menu-import-errors"
      tabIndex={0}
    >
      <table className="menu-import-table">
        <caption id="menu-import-errors">{translate("errorsCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{translate("errorRow")}</th>
            <th scope="col">{translate("errorField")}</th>
            <th scope="col">{translate("errorReason")}</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error, index) => (
            <tr key={index}>
              <th scope="row">{number.format(error.row)}</th>
              <td>{translate(`fields.${error.field}`)}</td>
              <td>{translate(`reasons.${error.reason}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ImportSummary({
  summary,
  locale,
  applied,
}: {
  summary: Preview["summary"];
  locale: Locale;
  applied: boolean;
}) {
  const translate = useTranslations("menuImport");
  const number = new Intl.NumberFormat(locale, { numberingSystem: "latn" });
  const fields = [
    ["categoriesCreated", "resultCategoriesCreated"],
    ["itemsCreated", "resultItemsCreated"],
    ["itemsUpdated", "resultItemsUpdated"],
    ["itemsUnchanged", "resultItemsUnchanged"],
  ] as const;

  return (
    <section className="menu-import-summary" aria-labelledby="menu-import-summary-title">
      <h3 id="menu-import-summary-title">
        {translate(applied ? "summaryAppliedCaption" : "summaryCaption")}
      </h3>
      <dl>
        {fields.map(([field, resultLabel]) => (
          <div key={field}>
            <dt>{translate(applied ? resultLabel : field)}</dt>
            <dd>{number.format(summary[field])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
