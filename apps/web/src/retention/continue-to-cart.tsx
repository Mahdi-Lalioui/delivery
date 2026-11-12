"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Button } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { readBrowserCart, saveBrowserCart } from "../restaurant/cart-storage";
import { readRestaurantItem } from "../restaurant/restaurant-http";
import type { Reorder } from "./orders-http";
import { reorderIntoCart, type ReorderCartResult } from "./reorder-cart";

type Phase = "idle" | "working" | "confirm" | "empty" | "error";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function phaseAfter(kind: ReorderCartResult["kind"]): Phase {
  if (kind === "merchant-change") return "confirm";
  return kind === "empty" ? "empty" : "error";
}

/**
 * CUS-21: one tap puts the reorder in the cart and opens the restaurant, where the cart bar
 * takes over. Another restaurant's cart is replaced only after the diner says so.
 */
export function ContinueToCart({
  draft,
  merchantName,
  locale,
}: {
  draft: Reorder["draft"];
  merchantName: string;
  locale: Locale;
}) {
  const translate = useTranslations("retentionOrders");
  const [phase, setPhase] = useState<Phase>("idle");
  const { restaurantSlug: slug, menuRevision } = draft;
  if (!slug || menuRevision === undefined) {
    return <p role="status">{translate("reorderOffline")}</p>;
  }

  async function go(replace: boolean) {
    if (!slug || menuRevision === undefined) return;
    const store = storage();
    if (store === null) {
      setPhase("error");
      return;
    }
    setPhase("working");
    const signal = AbortSignal.timeout(20_000);
    const result = await reorderIntoCart({
      draft,
      merchantName,
      cart: readBrowserCart(store, Date.now()),
      replace,
      now: Date.now(),
      newLineId: () => crypto.randomUUID(),
      readItem: (itemId) =>
        readRestaurantItem({ slug, itemId, expectedRevision: menuRevision }, signal),
    });
    if (result.kind === "ready" && saveBrowserCart(store, result.cart)) {
      window.location.assign(`/${locale}/restaurants/${encodeURIComponent(slug)}`);
      return;
    }
    setPhase(phaseAfter(result.kind));
  }

  if (phase === "confirm") {
    return (
      <div className="orders-reorder-confirm" role="alertdialog" aria-labelledby="orders-replace">
        <p id="orders-replace">{translate("replaceCartPrompt")}</p>
        <Button variant="primary" size="lg" isBlock onClick={() => void go(true)}>
          {translate("replaceCart")}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          isBlock
          onClick={() => {
            setPhase("idle");
          }}
        >
          {translate("keepCart")}
        </Button>
      </div>
    );
  }
  return (
    <>
      {phase === "empty" && <p role="alert">{translate("reorderNothing")}</p>}
      {phase === "error" && <p role="alert">{translate("reorderError")}</p>}
      <Button
        variant="primary"
        size="lg"
        isBlock
        isLoading={phase === "working"}
        disabled={phase === "working" || phase === "empty"}
        onClick={() => void go(false)}
      >
        {translate("continueToCart")}
      </Button>
    </>
  );
}
