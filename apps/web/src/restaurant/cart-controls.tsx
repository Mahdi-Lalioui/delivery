import { useState } from "react";
import { getCartSummary, removeCartLine, setCartQuantity } from "@zaafran/domain/cart";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { CartContents } from "./cart-contents";
import { RestaurantDialog } from "./restaurant-dialog";
import { getRestaurantMessages } from "./restaurant-messages";
import type { useBrowserCart } from "./use-browser-cart";

export function CartControls({
  basket,
  locale,
}: {
  basket: ReturnType<typeof useBrowserCart>;
  locale: Locale;
}) {
  const [cartVisible, setCartVisible] = useState(false);
  const [cartError, setCartError] = useState(false);
  const messages = getRestaurantMessages(locale);
  const { cart } = basket;
  if (cart === null)
    return (
      <aside className="restaurant-cart-panel" aria-label={messages.panelTitle}>
        <h2>{messages.panelTitle}</h2>
        <p className="restaurant-cart-panel-empty">
          <Icon name="bag" size={32} />
          {messages.panelEmpty}
        </p>
      </aside>
    );
  const summary = getCartSummary(cart);
  if (!summary.ok) return null;
  const activeCart = cart;

  function edit(lineId: string, quantity: number) {
    const result = setCartQuantity({ cart: activeCart, lineId, quantity, now: Date.now() });
    if (!result.ok) {
      setCartError(true);
      return;
    }
    basket.save(result.value);
    setCartError(false);
  }

  function remove(lineId: string) {
    const result = removeCartLine({ cart: activeCart, lineId, now: Date.now() });
    if (!result.ok) {
      setCartError(true);
      return;
    }
    basket.save(result.value);
    setCartError(false);
    if (result.value === null) setCartVisible(false);
  }

  return (
    <>
      <div className="restaurant-cart-bar">
        <button
          type="button"
          className="restaurant-cart-button"
          aria-label={messages.viewCart}
          onClick={() => {
            setCartVisible(true);
          }}
        >
          <span>
            <bdi className="restaurant-cart-count" key={summary.value.itemCount}>
              {summary.value.itemCount}
            </bdi>
            {messages.viewCart}
          </span>
          <bdi className="restaurant-cart-total" key={summary.value.subtotalDzd}>
            {formatDzd(summary.value.subtotalDzd, locale)}
          </bdi>
        </button>
      </div>

      <aside className="restaurant-cart-panel" aria-label={messages.panelTitle}>
        <h2>{messages.panelTitle}</h2>
        <CartContents cart={activeCart} locale={locale} onQuantity={edit} onRemove={remove} />
        <a
          className="ui-button ui-button-primary ui-button-lg restaurant-checkout"
          href={`/${locale}/checkout`}
        >
          {messages.checkout}
          <bdi>{formatDzd(summary.value.subtotalDzd, locale)}</bdi>
        </a>
      </aside>

      {cartVisible && (
        <RestaurantDialog
          title={messages.cart}
          locale={locale}
          onClose={() => {
            setCartVisible(false);
          }}
        >
          <CartContents cart={activeCart} locale={locale} onQuantity={edit} onRemove={remove} />
          {cartError && <p role="alert">{messages.cartError}</p>}
          <a
            className="ui-button ui-button-primary ui-button-lg restaurant-checkout"
            href={`/${locale}/checkout`}
          >
            {messages.checkout}
            <bdi>{formatDzd(summary.value.subtotalDzd, locale)}</bdi>
          </a>
        </RestaurantDialog>
      )}
    </>
  );
}
