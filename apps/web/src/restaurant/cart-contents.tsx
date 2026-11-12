import { getCartSummary, type Cart } from "@zaafran/domain/cart";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { RestaurantQuantity } from "./restaurant-quantity";
import { localizeRestaurantText } from "./restaurant-types";
import { getRestaurantMessages } from "./restaurant-messages";

export function CartContents({
  cart,
  locale,
  onQuantity,
  onRemove,
}: {
  cart: Cart;
  locale: Locale;
  onQuantity: (lineId: string, quantity: number) => void;
  onRemove: (lineId: string) => void;
}) {
  const messages = getRestaurantMessages(locale);
  const summary = getCartSummary(cart);
  return (
    <div className="restaurant-cart-contents">
      <p className="restaurant-cart-merchant">
        <Icon name="store" size={20} />
        <bdi>{cart.merchant.name}</bdi>
      </p>
      <ul className="restaurant-cart-lines" role="list">
        {cart.lines.map((line) => {
          const name = localizeRestaurantText(line.names, locale);
          const lineTotal = getCartSummary({ ...cart, lines: [line] });
          return (
            <li key={line.lineId} className="restaurant-cart-line">
              <div className="restaurant-cart-line-head">
                <h3>
                  <bdi>{name}</bdi>
                </h3>
                {lineTotal.ok && (
                  <bdi className="restaurant-price">
                    {formatDzd(lineTotal.value.subtotalDzd, locale)}
                  </bdi>
                )}
              </div>
              {line.options.length > 0 && (
                <ul className="restaurant-cart-options" role="list">
                  {line.options.map((option) => (
                    <li key={option.optionGroupId + option.optionId}>
                      {localizeRestaurantText(option.names, locale)}
                    </li>
                  ))}
                </ul>
              )}
              {line.note !== "" && (
                <p>
                  <bdi>{line.note}</bdi>
                </p>
              )}
              <div className="restaurant-cart-line-actions">
                <RestaurantQuantity
                  label={messages.quantity + messages.separator + name}
                  decreaseLabel={messages.decreaseQuantity + messages.separator + name}
                  increaseLabel={messages.increaseQuantity + messages.separator + name}
                  quantity={line.quantity}
                  onChange={(quantity) => {
                    onQuantity(line.lineId, quantity);
                  }}
                />
                <button
                  type="button"
                  className="restaurant-cart-remove"
                  aria-label={messages.remove + messages.separator + name}
                  onClick={() => {
                    onRemove(line.lineId);
                  }}
                >
                  {messages.remove}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {summary.ok && (
        <div className="restaurant-cart-summary">
          <p>
            <span>{messages.subtotal}</span>
            <bdi className="restaurant-price">{formatDzd(summary.value.subtotalDzd, locale)}</bdi>
          </p>
          {cart.merchant.minimumDzd > 0 && (
            <p role="status">
              {summary.value.remainingMinimumDzd > 0
                ? messages.remaining.replace(
                    "{amount}",
                    formatDzd(summary.value.remainingMinimumDzd, locale),
                  )
                : messages.minimumReached}
            </p>
          )}
        </div>
      )}
      <p className="restaurant-muted">{messages.saved}</p>
    </div>
  );
}
