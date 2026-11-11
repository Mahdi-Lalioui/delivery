"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  MoneyField,
  SegmentedControl,
  Skeleton,
  TextField,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SlotPicker } from "../retention/slot-picker";
import { localizeRestaurantText } from "../restaurant/restaurant-types";
import type { CheckoutState } from "./use-checkout";
import { parseTender } from "./use-checkout";

function readText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function AddressForm({ state, onDone }: { state: CheckoutState; onDone: () => void }) {
  const translate = useTranslations("checkout");
  const [isSaving, setSaving] = useState(false);
  const [hasFailed, setFailed] = useState(false);
  if (state.pin === null) return <p className="checkout-note">{translate("pinMissing")}</p>;
  return (
    <form
      className="checkout-address-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const optional = (name: string) => {
          const value = readText(form, name);
          return value === undefined ? {} : { [name]: value };
        };
        setSaving(true);
        void state
          .addAddress({
            label: readText(form, "label") ?? "",
            ...optional("building"),
            ...optional("floor"),
            ...optional("landmark"),
            ...optional("instructions"),
          })
          .then((isSaved) => {
            setSaving(false);
            setFailed(!isSaved);
            if (isSaved) onDone();
          });
      }}
    >
      <p className="checkout-note">
        <Icon name="pin" size={16} />
        {translate("pinFromLocation")}
      </p>
      <TextField
        label={translate("addressLabel")}
        hint={translate("addressLabelHint")}
        name="label"
        required
        maxLength={80}
      />
      <TextField label={translate("building")} name="building" maxLength={120} />
      <div className="checkout-pair">
        <TextField label={translate("floor")} name="floor" maxLength={32} />
        <TextField label={translate("landmark")} name="landmark" maxLength={160} />
      </div>
      <TextField label={translate("instructions")} name="instructions" maxLength={500} />
      {hasFailed && <p role="alert">{translate("error")}</p>}
      <div className="checkout-inline-actions">
        <Button variant="ghost" onClick={onDone}>
          {translate("cancel")}
        </Button>
        <Button type="submit" variant="primary" isLoading={isSaving}>
          {translate("saveAddress")}
        </Button>
      </div>
    </form>
  );
}

function AddressList({ state }: { state: CheckoutState }) {
  const translate = useTranslations("checkout");
  const [isAdding, setAdding] = useState(false);
  const { addresses } = state;
  if (addresses.kind === "loading") return <Skeleton label={translate("loading")} lines={3} />;
  if (addresses.kind === "error") return <ErrorState title={translate("error")} />;
  if (addresses.kind !== "ready") return null;
  if (isAdding)
    return (
      <AddressForm
        state={state}
        onDone={() => {
          setAdding(false);
        }}
      />
    );
  return (
    <fieldset className="checkout-addresses">
      <legend>{translate("addresses")}</legend>
      {addresses.value.length === 0 && (
        <EmptyState
          icon="pin"
          title={translate("noAddresses")}
          body={translate("noAddressesBody")}
        />
      )}
      {addresses.value.map((address) => (
        <label key={address.addressId} className="checkout-option">
          <input
            type="radio"
            name="address"
            checked={state.addressId === address.addressId}
            onChange={() => {
              state.setAddressId(address.addressId);
            }}
          />
          <Icon name="home" size={20} />
          <span>
            <strong>
              <bdi>{address.label}</bdi>
            </strong>
            {address.building !== undefined && <bdi>{address.building}</bdi>}
          </span>
        </label>
      ))}
      <button
        type="button"
        className="checkout-add"
        onClick={() => {
          setAdding(true);
        }}
      >
        <Icon name="plus" size={20} />
        {translate("addAddress")}
      </button>
    </fieldset>
  );
}

export function FulfilmentStep({ state }: { state: CheckoutState }) {
  const translate = useTranslations("checkout");
  return (
    <div className="checkout-step">
      <h2>{translate("how")}</h2>
      <SegmentedControl
        legend={translate("how")}
        isLegendVisible={false}
        name="fulfilment"
        value={state.fulfilment}
        onChange={state.setFulfilment}
        options={[
          { value: "delivery", label: translate("delivery"), icon: "bike" },
          { value: "pickup", label: translate("pickup"), icon: "store" },
        ]}
      />
      {state.fulfilment === "delivery" ? (
        <AddressList state={state} />
      ) : (
        <div className="checkout-pickup">
          <Icon name="store" size={24} />
          <div>
            <strong>{translate("pickupAt", { name: state.cart?.merchant.name ?? "" })}</strong>
            <p>{translate("pickupBody")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function TimingStep({ state }: { state: CheckoutState }) {
  const translate = useTranslations("checkout");
  const { slots } = state;
  return (
    <div className="checkout-step">
      <h2>{translate("when")}</h2>
      {slots.kind === "loading" && <Skeleton label={translate("loading")} lines={3} />}
      {slots.kind === "ready" && (
        <SlotPicker slots={slots.value} value={state.slot} onChange={state.setSlot} />
      )}
      {(slots.kind === "error" || slots.kind === "sign-in") && (
        <SlotPicker slots={[]} value={state.slot} onChange={state.setSlot} />
      )}
    </div>
  );
}

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
          <bdi key={totalDzd}>{formatDzd(totalDzd, locale)}</bdi>
        </dd>
      </div>
    </dl>
  );
}

export function PaymentStep({ state, locale }: { state: CheckoutState; locale: Locale }) {
  const translate = useTranslations("checkout");
  const total = state.quote.kind === "ready" ? state.quote.quote.totalDzd : undefined;
  const tender = parseTender(state.tender);
  const isShort = tender !== undefined && total !== undefined && tender < total;
  return (
    <div className="checkout-step">
      <h2>{translate("summary")}</h2>
      <ul className="checkout-lines" role="list">
        {state.cart?.lines.map((line) => (
          <li key={line.lineId}>
            <span className="checkout-qty">{line.quantity}</span>
            <bdi>{localizeRestaurantText(line.names, locale)}</bdi>
          </li>
        ))}
      </ul>
      <QuoteLines state={state} locale={locale} />
      <div className="checkout-cash">
        <p>
          <Icon name="card" size={20} />
          {translate(state.fulfilment === "pickup" ? "cashPickup" : "cash")}
        </p>
        <MoneyField
          label={translate("payingWith")}
          hint={translate("payingWithHint")}
          name="tender"
          unit={translate("unit")}
          value={state.tender}
          onChange={(event) => {
            state.setTender(event.currentTarget.value);
          }}
          error={isShort ? translate("tooLittle") : undefined}
        />
        {tender !== undefined && total !== undefined && tender > total && (
          <p className="checkout-change" role="status">
            {translate("change", { amount: formatDzd(tender - total, locale) })}
          </p>
        )}
      </div>
    </div>
  );
}
