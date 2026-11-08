import { expect, test } from "vitest";
import catalog from "../search-synonyms.json" with { type: "json" };

test("[SRCH-03] the synonym catalog includes every documented multilingual spelling", () => {
  const required = {
    pizza: ["pizza", "بيتزا", "pitza", "piza"],
    tacos: ["tacos", "طاكوس", "tacose"],
    shawarma: ["shawarma", "chawarma", "شاورما", "chawerma"],
    mhadjeb: ["mhadjeb", "m'hadjeb", "محاجب"],
    karantika: ["garantita", "karantika", "كرانتيكا"],
    couscous: ["couscous", "kesksou", "كسكس"],
    chorba: ["chorba", "شربة"],
    bourek: ["bourek", "بوراك"],
    zlabia: ["zlabia", "زلابية"],
    "qalb el louz": ["qalb el louz", "قلب اللوز"],
    chicken: ["chicken", "poulet", "djaj", "دجاج"],
    grill: ["grill", "grillade", "مشوي"],
    burger: ["burger", "برغر"],
    panini: ["panini", "بانيني"],
    fries: ["fries", "frites", "فريت"],
    juice: ["juice", "jus", "عصير"],
    coffee: ["coffee", "café", "قهوة"],
    pastry: ["pastry", "pâtisserie", "حلويات"],
    fish: ["fish", "poisson", "حوت"],
  };

  for (const [dish, spellings] of Object.entries(required)) {
    expect(catalog, dish).toHaveProperty(dish, expect.arrayContaining(spellings));
  }
});
