import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import type { FeedRestaurant } from "./feed-http";
import { fillFeedMessage, getFeedMessages } from "./feed-messages";

type Offer = NonNullable<FeedRestaurant["offer"]>;

function headline(offer: Offer, locale: Locale): string {
  const messages = getFeedMessages(locale);
  switch (offer.kind) {
    case "percent":
      return fillFeedMessage(messages.offerPercent, {
        percent: String(Math.round(offer.basisPoints / 100)),
      });
    case "fixed":
      return fillFeedMessage(messages.offerFixed, { amount: formatDzd(offer.amountDzd, locale) });
    case "free_delivery":
      return messages.offerFreeDelivery;
  }
}

function condition(offer: Offer, locale: Locale): string | null {
  const messages = getFeedMessages(locale);
  if (offer.minimumSubtotalDzd > 0) {
    return fillFeedMessage(messages.offerFrom, {
      amount: formatDzd(offer.minimumSubtotalDzd, locale),
    });
  }
  if (offer.kind === "percent" && offer.capDzd > 0) {
    return fillFeedMessage(messages.offerUpTo, { amount: formatDzd(offer.capDzd, locale) });
  }
  return null;
}

/** The badge's two parts: the saving, and the one condition a diner needs to know first. */
export function offerLabel(offer: Offer, locale: Locale) {
  return { short: headline(offer, locale), detail: condition(offer, locale) };
}

/** A harissa ribbon on the card photo. The quote still confirms eligibility and price. */
export function OfferBadge({ offer, locale }: { offer: Offer; locale: Locale }) {
  const { short, detail } = offerLabel(offer, locale);
  const spoken = detail === null ? short : `${short}, ${detail}`;
  return (
    <span
      className="restaurant-feed-offer"
      aria-label={fillFeedMessage(getFeedMessages(locale).offerLabel, { offer: spoken })}
      role="img"
    >
      <bdi aria-hidden="true">{short}</bdi>
      {detail !== null && <bdi aria-hidden="true">{detail}</bdi>}
    </span>
  );
}
