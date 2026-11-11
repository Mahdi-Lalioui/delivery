"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { ButtonLink, EmptyState, Icon, Skeleton } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { FulfilmentStep, PaymentStep, TimingStep } from "./checkout-steps";
import {
  isTenderInRange,
  parseTender,
  type CheckoutState,
  type CheckoutStep,
} from "./use-checkout";
import "./checkout.css";

const stepKeys = ["stepFulfilment", "stepTiming", "stepPayment"] as const;

function Progress({ step }: { step: CheckoutStep }) {
  const translate = useTranslations("checkout");
  return (
    <nav aria-label={translate("steps")}>
      <ol className="checkout-progress" data-step={step}>
        {stepKeys.map((key, index) => (
          <li
            key={key}
            aria-current={index + 1 === step ? "step" : undefined}
            data-done={index + 1 < step}
          >
            <span className="checkout-progress-dot">
              {index + 1 < step ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <span>{translate(key)}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function canContinue(state: CheckoutState): boolean {
  if (state.step === 1) return state.fulfilment === "pickup" || state.addressId !== undefined;
  return true;
}

function canPlace(state: CheckoutState): boolean {
  if (state.quote.kind !== "ready") return false;
  const tender = parseTender(state.tender);
  return tender === undefined || isTenderInRange(tender, state.quote.quote.totalDzd);
}

/** One primary action per step; Place order morphs loading → success. */
function Actions({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  const { step, place, quote } = state;
  const isPlacing = place.kind === "placing";
  const label =
    step < 3
      ? translate("continue")
      : place.kind === "placed"
        ? translate("placed")
        : translate("place", {
            total: quote.kind === "ready" ? formatDzd(quote.quote.totalDzd, locale) : "",
          });
  const isDisabled = step < 3 ? !canContinue(state) : !canPlace(state) || isPlacing;
  return (
    <div className="checkout-actions">
      {step > 1 && (
        <button
          type="button"
          className="checkout-back"
          aria-label={translate("back")}
          onClick={() => {
            state.setStep(step === 3 ? 2 : 1);
          }}
        >
          <Icon name="chevron" size={24} />
        </button>
      )}
      <button
        type="button"
        className="checkout-primary"
        data-state={isPlacing ? "placing" : place.kind === "placed" ? "placed" : "idle"}
        aria-busy={isPlacing}
        disabled={isDisabled}
        onClick={() => {
          if (step < 3) state.setStep(step === 1 ? 2 : 3);
          else state.submit();
        }}
      >
        {isPlacing ? (
          <>
            <span className="ui-spinner" aria-hidden="true" />
            {translate("placing")}
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}

/** Full-screen celebration, then the automatic move to tracking (SPRINT screen 6). */
export function OrderConfirmed({
  locale,
  orderId,
  shortCode,
  restaurant,
  redirectMs = 2600,
}: {
  locale: Locale;
  orderId: string;
  shortCode: string;
  restaurant: string;
  redirectMs?: number | null;
}) {
  const translate = useTranslations("checkout");
  const href = `/${locale}/orders/${orderId}`;
  useEffect(() => {
    if (redirectMs === null) return;
    const timer = window.setTimeout(() => {
      window.location.assign(href);
    }, redirectMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [href, redirectMs]);
  return (
    <section
      className="checkout-confirmed"
      aria-labelledby="checkout-confirmed-title"
      role="status"
    >
      <div className="checkout-confirmed-burst" aria-hidden="true">
        <span className="checkout-confirmed-check">
          <Icon name="check" size={48} />
        </span>
      </div>
      <h1 id="checkout-confirmed-title">{translate("confirmedTitle")}</h1>
      <p>{translate("confirmedBody", { restaurant })}</p>
      <p className="checkout-confirmed-code">{translate("confirmedCode", { code: shortCode })}</p>
      <ButtonLink variant="primary" href={href}>
        {translate("tracking")}
      </ButtonLink>
    </section>
  );
}

function Blocked({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  if (state.cart === undefined) return <Skeleton label={translate("loading")} lines={6} />;
  const isSignIn =
    state.addresses.kind === "sign-in" ||
    state.quote.kind === "sign-in" ||
    state.place.kind === "sign-in";
  if (isSignIn)
    return (
      <EmptyState
        icon="user"
        title={translate("signIn")}
        body={translate("signInBody")}
        action={
          <ButtonLink variant="primary" href={`/${locale}/sign-in`}>
            {translate("signInAction")}
          </ButtonLink>
        }
      />
    );
  return (
    <EmptyState
      icon="bag"
      title={translate("emptyCart")}
      body={translate("emptyCartBody")}
      action={
        <ButtonLink variant="primary" href={`/${locale}/discover`}>
          {translate("browse")}
        </ButtonLink>
      }
    />
  );
}

function StepBody({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  const { place } = state;
  return (
    <div className="checkout-body" key={state.step}>
      {state.step === 1 && <FulfilmentStep state={state} />}
      {state.step === 2 && <TimingStep state={state} />}
      {state.step === 3 && <PaymentStep state={state} locale={locale} />}
      {place.kind === "expired" && <p role="alert">{translate("expired")}</p>}
      {place.kind === "error" && <p role="alert">{translate("error")}</p>}
    </div>
  );
}

function isCheckoutBlocked(state: CheckoutState): boolean {
  if (state.cart === undefined || state.cart === null) return true;
  return [state.addresses.kind, state.quote.kind, state.place.kind].includes("sign-in");
}

/** CUS-13 / CUS-14 / ORD-01 checkout view (page and design gallery). */
export function CheckoutView({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  const { place } = state;
  if (place.kind === "placed")
    return (
      <OrderConfirmed
        locale={locale}
        orderId={place.order.orderId}
        shortCode={place.order.shortCode}
        restaurant={state.cart?.merchant.name ?? ""}
      />
    );
  const isBlocked = isCheckoutBlocked(state);
  return (
    <section className="checkout" aria-labelledby="checkout-title">
      <header className="checkout-header">
        <h1 id="checkout-title">{translate("title")}</h1>
        {state.cart && (
          <p>
            <bdi>{state.cart.merchant.name}</bdi>
          </p>
        )}
      </header>
      {isBlocked ? (
        <Blocked state={state} locale={locale} />
      ) : (
        <>
          <Progress step={state.step} />
          <StepBody state={state} locale={locale} />
          <Actions state={state} locale={locale} />
        </>
      )}
    </section>
  );
}
