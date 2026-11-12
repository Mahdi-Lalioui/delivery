"use client";

import { brand } from "@zaafran/config/brand";
import { useCallback, useEffect, useState } from "react";
import {
  addCartLine,
  removeCartLine,
  setCartQuantity,
  type Cart,
  type CartLine,
} from "@zaafran/domain/cart";
import type { Locale } from "@zaafran/i18n/locales";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@zaafran/ui";
import { CartControls } from "./cart-controls";
import { ItemDialog } from "./item-dialog";
import { matchesDish, MenuCategory } from "./menu-category";
import { PopularRow } from "./popular-row";
import { StateArt } from "../customer/state-art";
import { flyToCart } from "../marketing/moments/fly-to-cart";
import "../marketing/moments/moments.css";
import { RestaurantDialog } from "./restaurant-dialog";
import { RestaurantHeader } from "./restaurant-header";
import { readRestaurant } from "./restaurant-http";
import { getRestaurantMessages } from "./restaurant-messages";
import {
  localizeRestaurantText,
  type DishSelection,
  type Restaurant,
  type Stepper,
} from "./restaurant-types";
import { useDishOrigin } from "./photo-flight";
import { useBrowserCart } from "./use-browser-cart";
import "@zaafran/ui/ui.css";
import "./restaurant.css";

type State = { phase: "loading" } | { phase: "error" } | { phase: "ready"; data: Restaurant };

function brandFor(locale: string) {
  return locale === "ar" ? brand.arabicName : brand.name;
}

export function RestaurantScreen({ slug, locale }: { slug: string; locale: Locale }) {
  const basket = useBrowserCart();
  useDishOrigin();
  return <RestaurantLoader key={slug} slug={slug} locale={locale} basket={basket} />;
}

function RestaurantLoader({
  slug,
  locale,
  basket,
}: {
  slug: string;
  locale: Locale;
  basket: ReturnType<typeof useBrowserCart>;
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
      // The tab and screen readers name the restaurant, not just the brand.
      if (data !== null) document.title = `${data.restaurant.name} · ${brandFor(locale)}`;
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
          art={<StateArt kind="error" />}
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
  refreshedCategory,
  onStale,
}: {
  slug: string;
  locale: Locale;
  data: Restaurant;
  basket: ReturnType<typeof useBrowserCart>;
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

  /** Inline stepper on a dish row: change the quantity, or remove the line at zero. */
  function step(lineId: string, quantity: number) {
    const cart = basket.cart;
    if (cart === null) return;
    const result =
      quantity <= 0
        ? removeCartLine({ cart, lineId, now: Date.now() })
        : setCartQuantity({ cart, lineId, quantity, now: Date.now() });
    if (!result.ok) {
      setCartError(true);
      return;
    }
    basket.save(result.value);
    setCartError(false);
    setAnnouncement(messages.updatedQuantity);
  }

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
    flyDishToCart(line.itemId);
  }

  return (
    <>
      <RestaurantHeader data={data} locale={locale} />
      <RestaurantMenu
        slug={slug}
        locale={locale}
        data={data}
        inCart={cartQuantities(basket.cart, data.restaurant.merchantId)}
        steppers={simpleLines(basket.cart, data.restaurant.merchantId)}
        onStep={(lineId, quantity) => {
          step(lineId, quantity);
        }}
        refreshedCategory={refreshedCategory}
        onChoose={setSelected}
        onStale={onStale}
      />
      <p className="restaurant-announcement" role="status">
        {announcement}
      </p>
      {cartError && <p role="alert">{messages.cartError}</p>}
      {basket.storageFailed && <p role="alert">{messages.storageError}</p>}
      <CartControls basket={basket} locale={locale} />
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

/** Tagged favourites first, topped up with other dishes so the row never shows a lone card. */
export function pickPopular(selections: readonly DishSelection[]): DishSelection[] {
  const available = selections.filter(({ dish }) => dish.isAvailable);
  const tagged = available.filter(({ dish }) => dish.tags.includes("popular"));
  const rest = available.filter(({ dish }) => !dish.tags.includes("popular"));
  const row = [...tagged, ...rest].slice(0, 6);
  return row.length >= 3 ? row : [];
}

function hasNoMatch(loaded: ReadonlyMap<string, readonly DishSelection[]>, query: string) {
  if (query.trim() === "") return false;
  return ![...loaded.values()].flat().some(({ dish }) => matchesDish(dish, query));
}

/** The memorable add: the dish photo arcs into the cart bar, whose count springs. */
function flyDishToCart(itemId: string) {
  window.setTimeout(() => {
    const source = document.querySelector<HTMLElement>(
      `[data-dish="${CSS.escape(itemId)}"] .restaurant-dish-photo`,
    );
    const target = document.querySelector<HTMLElement>(".restaurant-cart-count");
    if (source && target) void flyToCart(source, target);
  }, 60);
}

/** Dishes that sit in the cart as one plain line (no options, no note) get an inline stepper. */
export function simpleLines(cart: Cart | null, merchantId: string): ReadonlyMap<string, Stepper> {
  const steppers = new Map<string, Stepper>();
  if (cart?.merchant.merchantId !== merchantId) return steppers;
  const counts = new Map<string, number>();
  for (const line of cart.lines) counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + 1);
  for (const line of cart.lines) {
    const isPlain = line.options.length === 0 && line.note === "";
    if (isPlain && counts.get(line.itemId) === 1)
      steppers.set(line.itemId, { lineId: line.lineId, quantity: line.quantity });
  }
  return steppers;
}

/** Quantity of each dish already in the cart for this restaurant, by item ID. */
function cartQuantities(cart: Cart | null, merchantId: string): ReadonlyMap<string, number> {
  const quantities = new Map<string, number>();
  if (cart?.merchant.merchantId !== merchantId) return quantities;
  for (const line of cart.lines) {
    quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + line.quantity);
  }
  return quantities;
}

function RestaurantMenu({
  slug,
  locale,
  data,
  inCart,
  steppers,
  onStep,
  refreshedCategory,
  onChoose,
  onStale,
}: {
  slug: string;
  locale: Locale;
  data: Restaurant;
  inCart: ReadonlyMap<string, number>;
  steppers: ReadonlyMap<string, Stepper>;
  onStep: (lineId: string, quantity: number) => void;
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
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<ReadonlyMap<string, readonly DishSelection[]>>(new Map());
  const recordDishes = useCallback((selections: readonly DishSelection[]) => {
    const categoryId = selections[0]?.categoryId;
    if (categoryId === undefined) return;
    setLoaded((previous) => new Map(previous).set(categoryId, selections));
  }, []);
  if (data.categories.length === 0)
    return <EmptyState art={<StateArt kind="plate" />} title={messages.empty} />;
  const popular = pickPopular([...loaded.values()].flat());
  return (
    <>
      <PopularRow
        selections={query.trim() === "" ? popular : []}
        merchantId={data.restaurant.merchantId}
        locale={locale}
        onChoose={onChoose}
      />
      <label className="restaurant-menu-search">
        <Icon name="search" size={18} />
        <span className="ui-visually-hidden">{messages.menuSearch}</span>
        <input
          type="search"
          dir="auto"
          placeholder={messages.menuSearch}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      {hasNoMatch(loaded, query) && (
        <p className="restaurant-menu-empty" role="status">
          {messages.menuSearchEmpty.replace("{query}", query.trim())}
        </p>
      )}
      <nav
        className="restaurant-category-tabs"
        aria-label={messages.menu}
        hidden={query.trim() !== ""}
      >
        <span className="restaurant-sticky-name" aria-hidden="true">
          <bdi>{data.restaurant.name}</bdi>
        </span>
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
            onDishes={recordDishes}
            inCart={inCart}
            steppers={steppers}
            onStep={onStep}
            query={query}
          />
        ))}
      </div>
    </>
  );
}
