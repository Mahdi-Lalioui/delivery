"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { addCartLine, type CartLine } from "@zaafran/domain/cart";
import type { Locale } from "@zaafran/i18n/locales";
import { Button, EmptyState, ErrorState, Skeleton } from "@zaafran/ui";
import { CartControls } from "./cart-controls";
import { ItemDialog } from "./item-dialog";
import { MenuCategory } from "./menu-category";
import { RestaurantDialog } from "./restaurant-dialog";
import { RestaurantHeader } from "./restaurant-header";
import { readRestaurant } from "./restaurant-http";
import { getRestaurantMessages } from "./restaurant-messages";
import { localizeRestaurantText, type Restaurant, type DishSelection } from "./restaurant-types";
import { useBrowserCart } from "./use-browser-cart";
import "@zaafran/ui/ui.css";
import "./restaurant.css";

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; data: Restaurant };

export function RestaurantScreen({
  slug,
  locale,
  cartAction,
}: {
  slug: string;
  locale: Locale;
  cartAction?: ReactNode;
}) {
  const basket = useBrowserCart();
  return (
    <RestaurantLoader
      key={slug}
      slug={slug}
      locale={locale}
      basket={basket}
      cartAction={cartAction}
    />
  );
}

function RestaurantLoader({
  slug,
  locale,
  basket,
  cartAction,
}: {
  slug: string;
  locale: Locale;
  basket: ReturnType<typeof useBrowserCart>;
  cartAction?: ReactNode;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [refreshedCategory, setRefreshedCategory] = useState<string | null>(null);
  const messages = getRestaurantMessages(locale);

  const refresh = useCallback((categoryId: string) => {
    setRefreshedCategory(categoryId);
    setState({ phase: "loading" });
    setAttempt((previous) => previous + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const data = await readRestaurant(slug, controller.signal);
      if (controller.signal.aborted) return;
      setState(data === null ? { phase: "error" } : { phase: "ready", data });
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [slug, attempt]);

  return (
    <div className="restaurant-screen">
      {refreshedCategory !== null && state.phase === "ready" && (
        <p role="status">{messages.updated}</p>
      )}
      {state.phase === "loading" && <Skeleton label={messages.loading} lines={5} />}
      {state.phase === "error" && (
        <ErrorState
          title={messages.error}
          retryLabel={messages.retry}
          onRetry={() => {
            setState({ phase: "loading" });
            setAttempt((previous) => previous + 1);
          }}
        />
      )}
      {state.phase === "ready" && (
        <RestaurantLoaded
          slug={slug}
          locale={locale}
          data={state.data}
          basket={basket}
          cartAction={cartAction}
          refreshedCategory={refreshedCategory}
          onStale={refresh}
        />
      )}
    </div>
  );
}

function RestaurantLoaded({
  slug,
  locale,
  data,
  basket,
  cartAction,
  refreshedCategory,
  onStale,
}: {
  slug: string;
  locale: Locale;
  data: Restaurant;
  basket: ReturnType<typeof useBrowserCart>;
  cartAction?: ReactNode;
  refreshedCategory: string | null;
  onStale: (categoryId: string) => void;
}) {
  const [selected, setSelected] = useState<DishSelection | null>(null);
  const [pending, setPending] = useState<CartLine | null>(null);
  const [cartError, setCartError] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const messages = getRestaurantMessages(locale);
  const staleSelection = useCallback(() => {
    if (selected !== null) onStale(selected.categoryId);
  }, [selected, onStale]);

  function add(line: CartLine, confirmMerchantChange = false) {
    const result = addCartLine({
      cart: basket.cart,
      merchant: {
        merchantId: data.restaurant.merchantId,
        name: data.restaurant.name,
        minimumDzd: 0,
      },
      line,
      now: Date.now(),
      confirmMerchantChange,
    });
    if (!result.ok) {
      if (result.error.code === "merchant_change_required") setPending(line);
      else setCartError(true);
      return;
    }
    basket.save(result.value);
    setPending(null);
    setSelected(null);
    setCartError(false);
    setAnnouncement(messages.added);
  }

  return (
    <>
      <RestaurantHeader data={data} locale={locale} />
      <RestaurantMenu
        slug={slug}
        locale={locale}
        data={data}
        refreshedCategory={refreshedCategory}
        onChoose={setSelected}
        onStale={onStale}
      />
      <p className="restaurant-announcement" role="status">
        {announcement}
      </p>
      {cartError && <p role="alert">{messages.cartError}</p>}
      {basket.storageFailed && <p role="alert">{messages.storageError}</p>}
      <CartControls basket={basket} locale={locale} action={cartAction} />
      {selected !== null && (
        <ItemDialog
          key={selected.dish.itemId}
          slug={slug}
          merchantId={data.restaurant.merchantId}
          dish={selected.dish}
          revision={selected.revision}
          onStale={staleSelection}
          locale={locale}
          onClose={() => {
            setSelected(null);
          }}
          onAdd={add}
        />
      )}
      {pending !== null && (
        <RestaurantDialog
          title={messages.replaceHeading}
          locale={locale}
          onClose={() => {
            setPending(null);
          }}
        >
          <p>{messages.replaceBody.replace("{name}", basket.cart?.merchant.name ?? "")}</p>
          <div className="restaurant-replace-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setPending(null);
              }}
            >
              {messages.keep}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                add(pending, true);
              }}
            >
              {messages.replace}
            </Button>
          </div>
        </RestaurantDialog>
      )}
    </>
  );
}

function RestaurantMenu({
  slug,
  locale,
  data,
  refreshedCategory,
  onChoose,
  onStale,
}: {
  slug: string;
  locale: Locale;
  data: Restaurant;
  refreshedCategory: string | null;
  onChoose: (selection: DishSelection) => void;
  onStale: (categoryId: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState(
    () =>
      data.categories.find((category) => category.categoryId === refreshedCategory)?.categoryId ??
      data.categories[0]?.categoryId ??
      "",
  );
  const messages = getRestaurantMessages(locale);
  if (data.categories.length === 0) return <EmptyState title={messages.empty} />;
  return (
    <>
      <nav className="restaurant-category-tabs" aria-label={messages.menu}>
        {data.categories.map((category) => (
          <a
            key={category.categoryId}
            href={"#category-" + category.categoryId}
            aria-current={activeCategory === category.categoryId ? "location" : undefined}
            onClick={() => {
              setActiveCategory(category.categoryId);
            }}
          >
            {localizeRestaurantText(category.names, locale)}
          </a>
        ))}
      </nav>
      <div className="restaurant-menu">
        {data.categories.map((category) => (
          <MenuCategory
            key={category.categoryId}
            slug={slug}
            merchantId={data.restaurant.merchantId}
            category={category}
            locale={locale}
            isActive={activeCategory === category.categoryId}
            onVisible={setActiveCategory}
            onChoose={onChoose}
            onStale={onStale}
          />
        ))}
      </div>
    </>
  );
}
