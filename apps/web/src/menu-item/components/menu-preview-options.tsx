import { getLocalizedContent } from "@zaafran/i18n/content";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { PreviewOptionGroup } from "../menu-preview-http";

function MenuPreviewOption({
  option,
  locale,
}: {
  option: PreviewOptionGroup["options"][number];
  locale: Locale;
}) {
  const t = useTranslations("menuPreview");
  const item = useTranslations("menuItem");
  return (
    <li className="menu-preview-option">
      <bdi>{getLocalizedContent(option.names, locale)}</bdi>
      {option.priceDeltaDzd > 0 && (
        <bdi>{t("priceDelta", { price: formatDzd(option.priceDeltaDzd, locale) })}</bdi>
      )}
      {option.isDefault && <span className="menu-item-hint">{t("defaultOption")}</span>}
      {!option.isAvailable && (
        <span className="menu-item-status" data-available={false}>
          {item("stockSoldOut")}
        </span>
      )}
    </li>
  );
}

export function MenuPreviewOptions({
  groups,
  locale,
}: {
  groups: PreviewOptionGroup[];
  locale: Locale;
}) {
  const t = useTranslations("menuPreview");
  if (groups.length === 0) return <p>{t("noOptions")}</p>;
  return (
    <>
      <h5>{t("optionsTitle")}</h5>
      <ul className="menu-preview-groups" role="list">
        {groups.map((group) => (
          <li key={group.optionGroupId} className="menu-preview-option-group">
            <p>
              <bdi>{getLocalizedContent(group.names, locale)}</bdi>
            </p>
            <p className="menu-item-hint">
              {t("optionLimits", { minimum: group.minimum, maximum: group.maximum })}
            </p>
            <ul role="list">
              {group.options.map((option) => (
                <MenuPreviewOption key={option.optionId} option={option} locale={locale} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
