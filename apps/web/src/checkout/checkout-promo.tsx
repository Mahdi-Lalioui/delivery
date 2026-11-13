"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { Button, Icon, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CheckoutState } from "./use-checkout";

/** The saving the server applied: the diner's code, or the restaurant's automatic offer. */
export function DiscountLine({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  if (state.quote.kind !== "ready") return null;
  const discountDzd = state.quote.quote.discountDzd ?? 0;
  if (discountDzd === 0) return null;
  const { code } = state.promotion;
  return (
    <div className="checkout-discount">
      <dt>
        {translate("discount")}
        <span>{code === null ? translate("discountOffer") : code}</span>
      </dt>
      <dd>
        {/* Amounts read left to right in every language, as on the other total lines. */}
        <bdi dir="ltr">
          {translate("discountAmount", { amount: formatDzd(discountDzd, locale) })}
        </bdi>
      </dd>
    </div>
  );
}

function AppliedCode({ state }: { state: CheckoutState }) {
  const translate = useTranslations("checkout");
  const { code } = state.promotion;
  if (code === null) return null;
  return (
    <p className="checkout-promo-applied" role="status">
      <Icon name="check" size={18} />
      <bdi>{translate("promoApplied", { code })}</bdi>
      <button type="button" className="checkout-promo-remove" onClick={state.removeCode}>
        {translate("promoRemove")}
      </button>
    </p>
  );
}

/**
 * Promo code, folded behind one quiet link so the total stays the focal point. Applying
 * re-quotes; a refused code is removed and the field says why and what to try next.
 */
export function PromoField({ state }: { state: CheckoutState }) {
  const translate = useTranslations("checkout");
  const { rejection, code } = state.promotion;
  const [isOpen, setIsOpen] = useState(rejection !== null);
  const [draft, setDraft] = useState("");
  // No total yet, no code: the diner first needs the quote to load.
  if (state.quote.kind !== "ready" && rejection === null) return null;
  if (code !== null) return <AppliedCode state={state} />;
  if (!isOpen && rejection === null) {
    return (
      <button
        type="button"
        className="checkout-promo-open"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Icon name="plus" size={18} />
        {translate("promoOpen")}
      </button>
    );
  }
  return (
    <form
      className="checkout-promo"
      onSubmit={(event) => {
        event.preventDefault();
        state.applyCode(draft);
      }}
    >
      <TextField
        label={translate("promoLabel")}
        name="promotionCode"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={64}
        value={draft}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
        }}
        error={rejection === null ? undefined : translate(`promo_${rejection}`)}
      />
      <Button type="submit" variant="secondary" size="md" disabled={draft.trim() === ""}>
        {translate("promoApply")}
      </Button>
    </form>
  );
}
