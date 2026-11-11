import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "@zaafran/ui";
import type { Locale } from "@zaafran/i18n/locales";
import { DishCard } from "./dish-card";
import { readRestaurantItems } from "./restaurant-http";
import { getRestaurantMessages } from "./restaurant-messages";
import {
  localizeRestaurantText,
  type Restaurant,
  type RestaurantDish,
  type DishSelection,
} from "./restaurant-types";

type State = {
  phase: "idle" | "loading" | "ready" | "error";
  dishes: readonly RestaurantDish[];
  nextCursor: string | null;
  revision: number | null;
};

export function MenuCategory({
  slug,
  merchantId,
  category,
  locale,
  isActive,
  onVisible,
  onChoose,
  onStale,
  onDishes,
  inCart,
}: {
  slug: string;
  merchantId: string;
  category: Restaurant["categories"][number];
  locale: Locale;
  isActive: boolean;
  onVisible: (id: string) => void;
  onChoose: (selection: DishSelection) => void;
  onStale: (categoryId: string) => void;
  /** Reports the dishes loaded so far, for the Popular row. */
  onDishes: (selections: readonly DishSelection[]) => void;
  inCart: ReadonlyMap<string, number>;
}) {
  const [state, setState] = useState<State>({
    phase: "idle",
    dishes: [],
    nextCursor: null,
    revision: null,
  });
  const section = useRef<HTMLElement>(null);
  const [isNear, setNear] = useState(false);
  useEffect(() => {
    const target = section.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const target = section.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible(category.categoryId);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [category.categoryId, onVisible]);
  useEffect(() => {
    const { revision } = state;
    if (revision === null) return;
    onDishes(state.dishes.map((dish) => ({ dish, revision, categoryId: category.categoryId })));
  }, [state, category.categoryId, onDishes]);
  const shouldLoad = state.phase === "loading" || (state.phase === "idle" && (isNear || isActive));
  useEffect(() => {
    if (!shouldLoad) return;
    const controller = new AbortController();
    async function load() {
      const result = await readRestaurantItems(
        {
          slug,
          categoryId: category.categoryId,
          ...(state.nextCursor === null ? {} : { cursor: state.nextCursor }),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result.kind === "stale" && state.nextCursor !== null) {
        onStale(category.categoryId);
        return;
      }
      if (result.kind !== "ready") {
        setState({ ...state, phase: "error" });
        return;
      }
      const page = result.value;
      if (state.revision !== null && state.revision !== page.revision) {
        onStale(category.categoryId);
        return;
      }
      if (page.nextCursor !== null && page.nextCursor === state.nextCursor) {
        setState({ ...state, phase: "error" });
        return;
      }
      const ids = new Set(state.dishes.map((dish) => dish.itemId));
      setState({
        phase: "ready",
        dishes: [
          ...state.dishes,
          ...page.items.filter((dish) => {
            if (ids.has(dish.itemId)) return false;
            ids.add(dish.itemId);
            return true;
          }),
        ],
        nextCursor: page.nextCursor,
        revision: page.revision,
      });
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [state, slug, category.categoryId, shouldLoad, onStale]);
  return (
    <section
      ref={section}
      id={"category-" + category.categoryId}
      className="restaurant-category"
      aria-labelledby={"heading-" + category.categoryId}
    >
      <h2 id={"heading-" + category.categoryId}>
        {localizeRestaurantText(category.names, locale)}
      </h2>
      <div className="restaurant-dish-grid">
        {state.dishes.map((dish) => (
          <DishCard
            key={dish.itemId}
            dish={dish}
            merchantId={merchantId}
            locale={locale}
            quantityInCart={inCart.get(dish.itemId) ?? 0}
            onChoose={(chosen) => {
              if (state.revision !== null)
                onChoose({
                  dish: chosen,
                  revision: state.revision,
                  categoryId: category.categoryId,
                });
            }}
          />
        ))}
      </div>
      <CategoryActions
        state={state}
        locale={locale}
        onLoad={() => {
          setState({ ...state, phase: "loading" });
        }}
      />
    </section>
  );
}

function CategoryActions({
  state,
  locale,
  onLoad,
}: {
  state: State;
  locale: Locale;
  onLoad: () => void;
}) {
  const messages = getRestaurantMessages(locale);
  if (state.phase === "idle" || state.phase === "loading")
    return <Skeleton label={messages.loading} />;
  if (state.phase === "error")
    return <ErrorState title={messages.error} retryLabel={messages.retry} onRetry={onLoad} />;
  if (state.dishes.length === 0) return <EmptyState title={messages.categoryEmpty} />;
  return state.nextCursor !== null ? (
    <Button variant="secondary" onClick={onLoad}>
      {messages.more}
    </Button>
  ) : null;
}
