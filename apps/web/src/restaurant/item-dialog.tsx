import { useEffect, useState } from "react";
import { ErrorState, Skeleton } from "@zaafran/ui";
import type { Locale } from "@zaafran/i18n/locales";
import type { CartLine } from "@zaafran/domain/cart";
import { RestaurantDialog } from "./restaurant-dialog";
import { ItemForm } from "./item-form";
import { DishPhoto } from "./dish-card";
import { getRestaurantMessages } from "./restaurant-messages";
import { readRestaurantItem } from "./restaurant-http";
import { createItemDraft, prepareItemLine, type ItemDraft } from "./item-draft";
import {
  localizeRestaurantText,
  type RestaurantDish,
  type RestaurantItem,
} from "./restaurant-types";

type State =
  { phase: "loading" | "error" } | { phase: "ready"; detail: RestaurantItem; draft: ItemDraft };

export function ItemDialog({
  slug,
  merchantId,
  dish,
  revision,
  locale,
  onClose,
  onAdd,
  onStale,
}: {
  slug: string;
  merchantId: string;
  dish: RestaurantDish;
  revision: number;
  locale: Locale;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
  onStale: () => void;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const messages = getRestaurantMessages(locale);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const result = await readRestaurantItem(
        { slug, itemId: dish.itemId, expectedRevision: revision },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result.kind === "stale") onStale();
      else if (result.kind === "error") setState({ phase: "error" });
      else setState({ phase: "ready", detail: result.value, draft: createItemDraft(result.value) });
    }
    void load();
    return () => {
      controller.abort();
    };
  }, [slug, dish.itemId, revision, onStale]);
  function add() {
    if (state.phase !== "ready") return;
    const configured = prepareItemLine(state.detail, state.draft, crypto.randomUUID());
    if (configured.ok) onAdd(configured.value);
  }
  return (
    <RestaurantDialog
      title={localizeRestaurantText(dish.names, locale)}
      locale={locale}
      onClose={onClose}
    >
      {state.phase !== "ready" && <DishPhoto merchantId={merchantId} dish={dish} locale={locale} />}
      {state.phase === "loading" && <Skeleton label={messages.itemLoading} />}
      {state.phase === "error" && <ErrorState title={messages.itemError} />}
      {state.phase === "ready" && (
        <ItemForm
          detail={state.detail}
          draft={state.draft}
          locale={locale}
          onDraft={(draft) => {
            setState({ ...state, draft });
          }}
          onAdd={add}
        >
          <DishPhoto merchantId={merchantId} dish={dish} locale={locale} />
        </ItemForm>
      )}
    </RestaurantDialog>
  );
}
