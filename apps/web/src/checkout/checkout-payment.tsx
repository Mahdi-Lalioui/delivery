"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { ErrorState, Icon, MoneyField, Skeleton, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { getCartSummary, type Cart } from "@zaafran/domain/cart";
import { localizeRestaurantText } from "../restaurant/restaurant-types";
import { DiscountLine, PromoField } from "./checkout-promo";
import type { CheckoutState } from "./use-checkout";
import { maxChangeDzd, parseTender } from "./use-checkout";
import { tenderSuggestions } from "./tender-suggestions";

function QuoteLines({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  const { quote } = state;
  if (quote.kind === "idle" || quote.kind === "loading")
    return <Skeleton label={translate("quoteLoading")} lines={3} />;
  if (quote.kind === "unavailable") return <ErrorState title={translate("unavailable")} />;
  if (quote.kind !== "ready")
    return (
      <ErrorState
        title={translate("quoteError")}
        retryLabel={translate("retry")}
        onRetry={state.retryQuote}
      />
    );
  const { subtotalDzd, deliveryFeeDzd, totalDzd, fulfilment } = quote.quote;
  return (
    <dl className="checkout-totals">
      <div>
        <dt>{translate("subtotal")}</dt>
        <dd>
          <bdi>{formatDzd(subtotalDzd, locale)}</bdi>
        </dd>
      </div>
      <DiscountLine state={state} locale={locale} />
      {fulfilment === "delivery" && (
        <div>
          <dt>{translate("deliveryFee")}</dt>
          <dd data-free={deliveryFeeDzd === 0}>
            {deliveryFeeDzd === 0 ? (
              translate("free")
            ) : (
              <bdi>{formatDzd(deliveryFeeDzd, locale)}</bdi>
            )}
          </dd>
        </div>
      )}
      <div className="checkout-total">
        <dt>{translate("total")}</dt>
        <dd>
          <span className="checkout-total-roll">
            <bdi key={totalDzd}>{formatDzd(totalDzd, locale)}</bdi>
          </span>
        </dd>
      </div>
    </dl>
  );
}

type TenderCheck =
  | { kind: "none" | "short" }
  | { kind: "too-much"; maxDzd: number }
  | { kind: "change"; changeDzd: number };

/** CUS-14: what to say about the cash tender against the quoted total. */
function checkTender(tender: number | undefined, total: number | undefined): TenderCheck {
  if (tender === undefined || total === undefined || tender === total) return { kind: "none" };
  if (tender < total) return { kind: "short" };
  if (tender > total + maxChangeDzd) return { kind: "too-much", maxDzd: total + maxChangeDzd };
  return { kind: "change", changeDzd: tender - total };
}

/** One line's price, computed by the domain (never in the view). */
function LinePrice({
  cart,
  line,
  locale,
}: {
  cart: CheckoutState["cart"];
  line: Cart["lines"][number];
  locale: Locale;
}) {
  if (!cart) return null;
  const summary = getCartSummary({ ...cart, lines: [line] });
  return summary.ok ? (
    <bdi className="checkout-line-price">{formatDzd(summary.value.subtotalDzd, locale)}</bdi>
  ) : null;
}

/** CUS-14: one tap for the usual amounts; the field below stays for anything else. */
function TenderChips(props: { state: CheckoutState; totalDzd: number; locale: Locale }) {
  const translate = useTranslations("checkout");
  const { state, totalDzd, locale } = props;
  const chosen = parseTender(state.tender);
  return (
    <div className="checkout-tender-chips" role="group" aria-label={translate("payingWith")}>
      {tenderSuggestions(totalDzd).map((amount) => (
        <button
          key={amount}
          type="button"
          className="checkout-tender-chip"
          aria-pressed={chosen === amount}
          onClick={() => {
            state.setTender(String(amount));
          }}
        >
          {amount === totalDzd ? translate("tenderExact") : <bdi>{formatDzd(amount, locale)}</bdi>}
        </button>
      ))}
    </div>
  );
}

function CashCard({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  const total = state.quote.kind === "ready" ? state.quote.quote.totalDzd : undefined;
  const check = checkTender(parseTender(state.tender), total);
  const error =
    check.kind === "short"
      ? translate("tooLittle")
      : check.kind === "too-much"
        ? translate("tooMuch", { max: formatDzd(check.maxDzd, locale) })
        : undefined;
  return (
    <div className="checkout-cash">
      <p>
        <Icon name="card" size={20} />
        {translate(state.fulfilment === "pickup" ? "cashPickup" : "cash")}
      </p>
      {total !== undefined && <TenderChips state={state} totalDzd={total} locale={locale} />}
      <MoneyField
        label={translate("payingWith")}
        hint={translate("payingWithHint")}
        name="tender"
        unit={translate("unit")}
        value={state.tender}
        onChange={(event) => {
          state.setTender(event.currentTarget.value);
        }}
        error={error}
      />
      {check.kind === "change" && (
        <p className="checkout-change" role="status">
          {translate("change", { amount: formatDzd(check.changeDzd, locale) })}
        </p>
      )}
    </div>
  );
}

function ContactPhone({ contact }: { contact: CheckoutState["contact"] }) {
  const t = useTranslations("checkout");
  if (contact.kind === "loading") return <Skeleton label={t("contactLoading")} lines={1} />;
  if (contact.kind === "error")
    return <ErrorState title={t("contactError")} retryLabel={t("retry")} onRetry={contact.retry} />;
  if (!contact.required) return null;
  return (
    <div className="checkout-contact">
      <TextField
        label={t("contactPhone")}
        hint={t("contactPhoneHint")}
        error={
          contact.value !== "" && contact.phone === undefined ? t("contactPhoneInvalid") : undefined
        }
        type="tel"
        required
        autoComplete="tel"
        dir="ltr"
        value={contact.value}
        onChange={(event) => {
          contact.setValue(event.currentTarget.value);
        }}
      />
    </div>
  );
}

/** The basket's lines and the quote; payment adds the promo field under it. */
function OrderLines({ state, locale }: { state: CheckoutState; locale: Locale }) {
  return (
    <>
      <ul className="checkout-lines" role="list">
        {state.cart?.lines.map((line) => (
          <li key={line.lineId}>
            <span className="checkout-qty">{line.quantity}</span>
            <bdi>{localizeRestaurantText(line.names, locale)}</bdi>
            <LinePrice cart={state.cart} line={line} locale={locale} />
          </li>
        ))}
      </ul>
      <QuoteLines state={state} locale={locale} />
    </>
  );
}

/** Desktop only: the order stays in view beside the delivery and time steps. */
export function OrderSummaryAside({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  return (
    <aside className="checkout-aside" aria-labelledby="checkout-aside-title">
      <h2 id="checkout-aside-title">{translate("summary")}</h2>
      <div className="checkout-receipt">
        <OrderLines state={state} locale={locale} />
      </div>
    </aside>
  );
}

export function PaymentStep({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  return (
    <div className="checkout-step">
      <h2>{translate("summary")}</h2>
      <div className="checkout-receipt">
        <OrderLines state={state} locale={locale} />
        <PromoField state={state} />
      </div>
      <ContactPhone contact={state.contact} />
      <CashCard state={state} locale={locale} />
    </div>
  );
}
