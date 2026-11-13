import type { Locale } from "@zaafran/i18n/locales";
import { iconElement } from "@zaafran/ui";
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

/** The second line: closed, rating with the star icon, wait. */
function facts(pin: PickupPin, locale: Locale) {
  const messages = getFeedMessages(locale);
  const line = part("span", "pickup-pin-meta");
  const add = (text: string) => {
    if (line.childNodes.length > 0) line.append(" · ");
    line.append(part("bdi", "", text));
  };
  if (!pin.isOpen) add(messages.closed);
  if (pin.rating !== null) {
    const rating = ratingText(pin.rating, locale);
    if (line.childNodes.length > 0) line.append(" · ");
    line.append(iconElement("star", 14));
    // Screen readers hear "noté 4,7 sur 5"; sighted diners see the star and the number.
    line.append(
      part("span", "ui-visually-hidden", fillFeedMessage(messages.ratingShort, { rating })),
    );
    const shown = part("bdi", "", rating);
    shown.setAttribute("aria-hidden", "true");
    line.append(shown);
  }
  if (pin.etaMinutes !== null) {
    const { min, max } = pin.etaMinutes;
    add(fillFeedMessage(messages.etaRange, { min: String(min), max: String(max) }));
  }
  return line;
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
  const line = facts(pin, locale);
  if (line.childNodes.length > 0) text.append(line);
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
