import { useState, type ReactNode } from "react";
import { getCartSummary, removeCartLine, setCartQuantity } from "@zaafran/domain/cart";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Icon } from "@zaafran/ui";
import { OdometerNumber } from "../marketing/moments/odometer-number";
import "../marketing/moments/moments.css";
import { CartContents } from "./cart-contents";
import { RestaurantDialog } from "./restaurant-dialog";
import { getRestaurantMessages } from "./restaurant-messages";
import type { useBrowserCart } from "./use-browser-cart";

export function CartControls({
  basket,
  locale,
  action,
}: {
  basket: ReturnType<typeof useBrowserCart>;
  locale: Locale;
  action?: ReactNode;
}) {
  const [cartVisible, setCartVisible] = useState(false);
  const [cartError, setCartError] = useState(false);
  const messages = getRestaurantMessages(locale);
  const { cart } = basket;
  if (cart === null) return null;
  const summary = getCartSummary(cart);
  if (!summary.ok) return null;
  const activeCart = cart;
  const total = formatDzd(summary.value.subtotalDzd, locale);

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
            <Icon name="bag" />
            <bdi>{summary.value.itemCount}</bdi> {messages.viewCart}
          </span>
          <bdi>{action ? <OdometerNumber value={total} /> : total}</bdi>
        </button>
      </div>

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
          {action}
        </RestaurantDialog>
      )}
    </>
  );
}
