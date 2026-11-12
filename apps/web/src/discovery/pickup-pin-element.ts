import type { Locale } from "@zaafran/i18n/locales";
import { fillFeedMessage, getFeedMessages } from "./feed-messages";
import type { PickupPin } from "./pickup-pins";

function ratingText(rating: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-DZ-u-nu-latn" : locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rating);
}

function part(tag: string, className: string, text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function logo(pin: PickupPin) {
  const frame = part("span", "pickup-pin-logo");
  if (pin.logoUrl === null) {
    frame.textContent = Array.from(pin.name)[0] ?? "";
    return frame;
  }
  const image = document.createElement("img");
  Object.assign(image, { src: pin.logoUrl, alt: "", width: 32, height: 32, decoding: "async" });
  image.addEventListener("error", () => {
    image.replaceWith(Array.from(pin.name)[0] ?? "");
  });
  frame.append(image);
  return frame;
}

/** The facts on the card's second line, visible and spoken. */
function facts(pin: PickupPin, locale: Locale) {
  const messages = getFeedMessages(locale);
  const list: string[] = [];
  if (!pin.isOpen) list.push(messages.closed);
  if (pin.rating !== null) list.push(`★ ${ratingText(pin.rating, locale)}`);
  if (pin.etaMinutes !== null) {
    const { min, max } = pin.etaMinutes;
    list.push(fillFeedMessage(messages.etaRange, { min: String(min), max: String(max) }));
  }
  return list;
}

/** A small branded card: logo, name, then rating and wait. It opens the restaurant's menu. */
export function pinCard(pin: PickupPin, locale: Locale): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "pickup-pin";
  link.href = `/${locale}/restaurants/${encodeURIComponent(pin.slug)}`;
  link.dataset.open = String(pin.isOpen);
  const text = part("span", "pickup-pin-text");
  const name = part("bdi", "pickup-pin-name", pin.name);
  text.append(name);
  const details = facts(pin, locale);
  if (details.length > 0) text.append(part("bdi", "pickup-pin-meta", details.join(" · ")));
  link.append(logo(pin), text);
  return link;
}

/** A round count standing in for pins too close to show apart; pressing it zooms to them. */
export function clusterBubble(count: number, locale: Locale, onPress: () => void) {
  const button = part("button", "pickup-cluster", String(count));
  button.setAttribute("type", "button");
  const label = fillFeedMessage(getFeedMessages(locale).pickupCluster, { count: String(count) });
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onPress);
  return button;
}
