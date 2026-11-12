import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RestaurantScreen } from "../src/restaurant/restaurant-screen";
import { ItemForm } from "../src/restaurant/item-form";
import { DishCard } from "../src/restaurant/dish-card";
import { CartContents } from "../src/restaurant/cart-contents";
import { createItemDraft, prepareItemLine } from "../src/restaurant/item-draft";
import { addCartLine, type Cart } from "@zaafran/domain/cart";
import { dzd } from "@zaafran/domain/money";
import { detail } from "./restaurant-fixture";

const noop = () => undefined;

test("[CUS-07:web] starts with an accessible localized loading state", () => {
  const html = renderToStaticMarkup(<RestaurantScreen slug="test" locale="ar" />);
  expect(html).toContain('role="status"');
  expect(html).toContain("جارٍ تحميل القائمة");
});

test("[CUS-07:web] sold-out dishes cannot be opened for ordering and have a text status", () => {
  const html = renderToStaticMarkup(
    <DishCard
      dish={{ ...detail.item, isAvailable: false }}
      merchantId="merchant"
      locale="fr"
      quantityInCart={0}
      onChoose={noop}
    />,
  );
  expect(html).toContain("Épuisé");
  expect(html).toContain("disabled");
  expect(html).toContain("Chawarma");
  expect(html).toContain("400 DA");
});

test("[CUS-07:web] a dish already in the cart shows its quantity on the add button", () => {
  const html = renderToStaticMarkup(
    <DishCard
      dish={detail.item}
      merchantId="merchant"
      locale="fr"
      quantityInCart={2}
      onChoose={noop}
    />,
  );
  expect(html).toContain('data-in-cart="true"');
  expect(html).toContain("×2");
  expect(html).toContain('aria-label="Choisir · Chawarma');
});

test("[CUS-08:web] required radios block Add, show option deltas and expose quantity and note bounds", () => {
  const html = renderToStaticMarkup(
    <ItemForm
      detail={detail}
      locale="fr"
      draft={createItemDraft(detail)}
      onDraft={noop}
      onAdd={noop}
    />,
  );
  expect(html).toContain('type="radio"');
  expect(html).toContain('type="checkbox"');
  expect(html).toContain("+50 DA");
  expect(html).toMatch(/aria-label="Réduire la quantité"[^>]*disabled/u);
  expect(html).toContain('<output aria-label="Quantité">1</output>');
  expect(html).toContain('maxLength="140"');
  // Add stays disabled and names the unanswered required group.
  expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*<span>Choisissez : Taille/u);
  expect(html).toContain("Note pour la cuisine");
});

test("[CUS-08:web] satisfies the required choice and shows the safe live configured total", () => {
  const draft = {
    ...createItemDraft(detail),
    quantity: 2,
    selections: [
      { optionGroupId: "size", optionIds: ["large"] },
      { optionGroupId: "extras", optionIds: ["cheese"] },
    ],
  };
  const html = renderToStaticMarkup(
    <ItemForm detail={detail} locale="ar" draft={draft} onDraft={noop} onAdd={noop} />,
  );
  expect(html).toContain("أضف · 940 دج");
  expect(html).toContain("الكمية");
  expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*<span>أضف/u);
});

test("[CUS-09:web] cart lines expose configured snapshots, quantity editing and separate removal", () => {
  const draft = {
    ...createItemDraft(detail),
    selections: [
      { optionGroupId: "size", optionIds: ["large"] },
      { optionGroupId: "extras", optionIds: ["cheese"] },
    ],
    note: "Sans oignon",
  };
  const line = prepareItemLine(detail, draft, "line");
  if (!line.ok) throw new Error(line.error.code);
  const cart = addCartLine({
    cart: null,
    merchant: { merchantId: "merchant", name: "Restaurant", minimumDzd: 1_000 },
    line: line.value,
    now: 1_000,
  });
  if (!cart.ok) throw new Error(cart.error.code);
  const html = renderToStaticMarkup(
    <CartContents cart={cart.value} locale="fr" onQuantity={noop} onRemove={noop} />,
  );
  expect(html).toContain("Chawarma");
  expect(html).toContain("Grande");
  expect(html).toContain("Sans oignon");
  expect(html).toContain("470 DA");
  expect(html).toContain("530 DA");
  expect(html).toContain("Retirer · Chawarma");
  expect(html).toContain('<output aria-label="Quantité · Chawarma">1</output>');
  expect(html).toContain('aria-label="Augmenter la quantité · Chawarma"');
  expect(html).toMatch(/aria-label="Réduire la quantité · Chawarma"[^>]*disabled/u);
});

test("[CUS-07:web] lists popular dishes with a distinct add label and hides when there are none", async () => {
  const { PopularRow } = await import("../src/restaurant/popular-row");
  const selection = { dish: detail.item, revision: 1, categoryId: "category" };
  const html = renderToStaticMarkup(
    <PopularRow selections={[selection]} merchantId="merchant" locale="fr" onChoose={noop} />,
  );
  expect(html).toContain("Les plus commandés");
  expect(html).toContain('aria-label="Les plus commandés · Chawarma');
  expect(
    renderToStaticMarkup(
      <PopularRow selections={[]} merchantId="merchant" locale="fr" onChoose={noop} />,
    ),
  ).toBe("");
});

test("[CUS-07:web] most ordered lists tagged dishes first, tops up to three and never shows one", async () => {
  const { pickPopular } = await import("../src/restaurant/restaurant-screen");
  const dish = (id: string, tags: ("popular" | "spicy")[] = []) => ({
    dish: { ...detail.item, itemId: id, tags },
    revision: 1,
    categoryId: "c",
  });
  expect(
    pickPopular([dish("a"), dish("b", ["popular"]), dish("c")]).map((s) => s.dish.itemId),
  ).toEqual(["b", "a", "c"]);
  expect(pickPopular([dish("a", ["popular"]), dish("b")])).toEqual([]);
});

test("[CUS-07:web] only a single plain cart line of a dish gets the inline stepper", async () => {
  const { simpleLines } = await import("../src/restaurant/restaurant-screen");
  const price = dzd(100);
  if (!price.ok) throw new Error("bad amount");
  const base = { names: { fr: "x" }, unitPriceDzd: price.value, quantity: 2, note: "" };
  const cart: Cart = {
    version: 1,
    merchant: { merchantId: "m", name: "M", minimumDzd: 0 },
    expiresAt: Date.now() + 60_000,
    lines: [
      { ...base, lineId: "l1", itemId: "plain", options: [] },
      { ...base, lineId: "l2", itemId: "noted", options: [], note: "sans oignon" },
      { ...base, lineId: "l3", itemId: "twice", options: [] },
      { ...base, lineId: "l4", itemId: "twice", options: [] },
    ],
  };
  const steppers = simpleLines(cart, "m");
  expect([...steppers.keys()]).toEqual(["plain"]);
  expect(steppers.get("plain")).toEqual({ lineId: "l1", quantity: 2 });
  expect(simpleLines(cart, "other").size).toBe(0);
});

test("[CUS-07:web] menu search matches names and descriptions without accents or case", async () => {
  const { matchesDish } = await import("../src/restaurant/menu-category");
  expect(matchesDish(detail.item, "chaw")).toBe(true);
  expect(matchesDish(detail.item, "GRILLADE")).toBe(true);
  expect(matchesDish(detail.item, "شاورما")).toBe(true);
  expect(matchesDish(detail.item, "pizza")).toBe(false);
  expect(matchesDish(detail.item, "  ")).toBe(true);
});

test("[CUS-07:web] a plain dish already in the cart shows a − n + stepper instead of +", () => {
  const html = renderToStaticMarkup(
    <DishCard
      dish={detail.item}
      merchantId="merchant"
      locale="fr"
      quantityInCart={2}
      stepper={{ lineId: "l1", quantity: 2 }}
      onStep={noop}
      onChoose={noop}
    />,
  );
  expect(html).toContain('class="restaurant-dish-stepper"');
  expect(html).toContain('aria-label="Réduire la quantité · Chawarma"');
  expect(html).not.toContain('class="restaurant-dish-add"');
});
