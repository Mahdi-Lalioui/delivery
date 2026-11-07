import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { MenuItem } from "../menu-item-http";
import type { useMenuItemEditor } from "../use-menu-item-editor";

type Controls = Pick<
  ReturnType<typeof useMenuItemEditor>,
  "inlinePrice" | "pending" | "openPrice" | "changePrice" | "submitPrice" | "cancelPrice"
>;

export function MenuItemInlinePrice({
  item,
  name,
  locale,
  blocked,
  controls,
}: {
  item: MenuItem;
  name: string;
  locale: Locale;
  blocked: boolean;
  controls: Controls;
}) {
  const translate = useTranslations("menuItem");
  const { itemId } = item;
  const { inlinePrice, pending, openPrice, changePrice, submitPrice, cancelPrice } = controls;

  if (inlinePrice?.itemId !== itemId) {
    return (
      <div className="menu-item-actions">
        <p className="menu-item-price">
          <bdi>{formatDzd(item.priceDzd, locale)}</bdi>
        </p>
        <button
          className="menu-item-secondary"
          type="button"
          id={`menu-item-edit-price-${itemId}`}
          aria-label={translate("editPriceLabel", { name })}
          disabled={blocked}
          onClick={() => {
            openPrice(itemId);
          }}
        >
          {translate("editPrice")}
        </button>
      </div>
    );
  }

  const inputId = `menu-item-price-input-${itemId}`;
  const currencyId = `menu-item-price-currency-${itemId}`;
  const errorId = `menu-item-price-error-${itemId}`;
  return (
    <form
      method="post"
      noValidate
      className="menu-item-inline-price"
      onSubmit={(event) => {
        event.preventDefault();
        submitPrice();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancelPrice();
      }}
    >
      <fieldset className="menu-item-field" disabled={pending}>
        <label htmlFor={inputId}>{translate("inlinePriceLabel", { name })}</label>
        <div className="menu-item-money">
          <input
            id={inputId}
            type="text"
            dir="ltr"
            inputMode="numeric"
            value={inlinePrice.value}
            aria-invalid={inlinePrice.invalid || undefined}
            aria-describedby={inlinePrice.invalid ? `${currencyId} ${errorId}` : currencyId}
            onChange={(event) => {
              changePrice(event.currentTarget.value);
            }}
          />
          <span id={currencyId}>{translate("currency")}</span>
        </div>
        {inlinePrice.invalid && (
          <p className="menu-item-error" id={errorId} role="alert">
            {translate("invalidPrice")}
          </p>
        )}
        <div className="menu-item-actions">
          <button className="menu-item-primary" id={`menu-item-save-price-${itemId}`} type="submit">
            {translate(pending ? "saving" : "savePrice")}
          </button>
          <button className="menu-item-secondary" type="button" onClick={cancelPrice}>
            {translate("cancel")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
