"use client";

import type { Cart } from "@zaafran/domain/cart";
import { isPublicLocale, type Locale } from "@zaafran/i18n/locales";
import { buzz } from "../feel/feel";
import { useCallback, useEffect, useRef, useState } from "react";
import { readSavedLocation } from "../discovery/location";
import { loadSlots, type Slot } from "../retention/scheduling";
import type { SlotChoice } from "../retention/slot-picker";
import { useBrowserCart } from "../restaurant/use-browser-cart";
import {
  loadAddresses,
  placeOrder,
  requestQuote,
  saveAddress,
  toQuoteInput,
  type Address,
  type AddressDraft,
  type PlacedOrder,
  type Quote,
  type Timing,
} from "./checkout-http";
import { useCheckoutContact, type CheckoutContact } from "./use-checkout-contact";

export type CheckoutStep = 1 | 2 | 3;
export type FulfilmentKind = "delivery" | "pickup";
type Load<T> = { kind: "loading" } | { kind: "ready"; value: T } | { kind: "sign-in" | "error" };
type QuoteState =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; quote: Quote }
  | { kind: "sign-in" | "unavailable" | "error" };
type PlaceState =
  | { kind: "idle" | "placing" }
  | { kind: "placed"; order: PlacedOrder }
  | { kind: "sign-in" | "expired" | "error" | "contact-required" | "cash-limit" };

export interface CheckoutState {
  cart: Cart | null | undefined;
  step: CheckoutStep;
  fulfilment: FulfilmentKind;
  addresses: Load<Address[]>;
  addressId: string | undefined;
  slots: Load<Slot[]>;
  slot: SlotChoice;
  quote: QuoteState;
  tender: string;
  contact: CheckoutContact;
  place: PlaceState;
  pin: { latitude: number; longitude: number } | null;
  setStep: (step: CheckoutStep) => void;
  setFulfilment: (fulfilment: FulfilmentKind) => void;
  setAddressId: (addressId: string) => void;
  addAddress: (draft: Omit<AddressDraft, "pin">) => Promise<boolean>;
  setSlot: (slot: SlotChoice) => void;
  setTender: (tender: string) => void;
  retryQuote: () => void;
  submit: () => void;
}

/** The scheduling contract has an Iftar slot; the quote only knows ASAP or an instant. */
export function toTiming(slot: SlotChoice): Timing {
  return slot.kind === "asap"
    ? { kind: "asap" }
    : { kind: "scheduled", scheduledFor: slot.scheduledFor };
}

/** CUS-14: the cash tender covers the total and is at most total + 10 000 DA. */
export const maxChangeDzd = 10_000;
export function isTenderInRange(tenderDzd: number, totalDzd: number): boolean {
  return tenderDzd >= totalDzd && tenderDzd <= totalDzd + maxChangeDzd;
}

/** Whole dinars typed by the customer, or undefined when empty or not a whole number. */
export function parseTender(tender: string): number | undefined {
  const digits = tender.replace(/[\s\u202f]/gu, "");
  return /^[0-9]{1,9}$/u.test(digits) ? Number(digits) : undefined;
}

function useAddresses(isDelivery: boolean) {
  const [addresses, setAddresses] = useState<Load<Address[]>>({ kind: "loading" });
  const [addressId, setAddressId] = useState<string>();
  useEffect(() => {
    if (!isDelivery) return;
    const controller = new AbortController();
    void loadAddresses(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.kind !== "ready") {
        setAddresses(result);
        return;
      }
      setAddresses({ kind: "ready", value: result.addresses });
      const preferred =
        result.addresses.find((address) => address.isDefault) ?? result.addresses[0];
      setAddressId((current) => current ?? preferred?.addressId);
    });
    return () => {
      controller.abort();
    };
  }, [isDelivery]);
  return { addresses, setAddresses, addressId, setAddressId };
}

function useSlots(cart: Cart | null | undefined, fulfilment: FulfilmentKind, addressId?: string) {
  const [slots, setSlots] = useState<Load<Slot[]>>({ kind: "loading" });
  const merchantId = cart?.merchant.merchantId;
  useEffect(() => {
    if (merchantId === undefined) return;
    if (fulfilment === "delivery" && addressId === undefined) return;
    const controller = new AbortController();
    const query =
      fulfilment === "pickup" || addressId === undefined
        ? { fulfilment: "pickup" as const, merchantId }
        : { fulfilment: "delivery" as const, merchantId, addressId };
    void loadSlots(query, controller.signal).then((result) => {
      if (!controller.signal.aborted)
        setSlots(result.kind === "ready" ? { kind: "ready", value: result.slots } : result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, fulfilment, addressId]);
  return slots;
}

function readPin() {
  try {
    const saved = readSavedLocation(window.localStorage);
    return saved === null
      ? null
      : { latitude: saved.location.latitude, longitude: saved.location.longitude };
  } catch {
    return null;
  }
}

export function useCheckout(locale: Locale): CheckoutState {
  const basket = useBrowserCart();
  const [isRestored, setRestored] = useState(false);
  const [step, setStep] = useState<CheckoutStep>(1);
  const contact = useCheckoutContact(step === 3);
  const orderLocale = isPublicLocale(locale) ? locale : undefined;
  const [fulfilment, setFulfilment] = useState<FulfilmentKind>("delivery");
  const [slot, setSlot] = useState<SlotChoice>({ kind: "asap" });
  const [quote, setQuote] = useState<QuoteState>({ kind: "idle" });
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [tender, setTender] = useState("");
  const [place, setPlace] = useState<PlaceState>({ kind: "idle" });
  const [pin, setPin] = useState<CheckoutState["pin"]>(null);
  const placementKey = useRef<{ identity: string; key: string }>(undefined);
  const { addresses, setAddresses, addressId, setAddressId } = useAddresses(
    fulfilment === "delivery",
  );
  const slots = useSlots(basket.cart, fulfilment, addressId);
  const cart = basket.cart;

  useEffect(() => {
    setRestored(true);
    setPin(readPin());
  }, []);

  useEffect(() => {
    if (step !== 3 || cart === null) return;
    if (fulfilment === "delivery" && addressId === undefined) return;
    const controller = new AbortController();
    setQuote({ kind: "loading" });
    const target =
      fulfilment === "delivery" && addressId !== undefined
        ? { fulfilment, addressId }
        : { fulfilment: "pickup" as const };
    void requestQuote(toQuoteInput(cart, target, toTiming(slot)), controller.signal).then(
      (result) => {
        if (!controller.signal.aborted)
          setQuote(result.kind === "ready" ? { kind: "ready", quote: result.quote } : result);
      },
    );
    return () => {
      controller.abort();
    };
  }, [step, cart, fulfilment, addressId, slot, quoteAttempt]);

  const addAddress = useCallback(
    async (draft: Omit<AddressDraft, "pin">) => {
      if (pin === null) return false;
      const result = await saveAddress({ ...draft, pin }, crypto.randomUUID());
      if (result.kind !== "saved") return false;
      setAddresses((current) =>
        current.kind === "ready"
          ? { kind: "ready", value: [...current.value, result.address] }
          : { kind: "ready", value: [result.address] },
      );
      setAddressId(result.address.addressId);
      return true;
    },
    [pin, setAddresses, setAddressId],
  );

  const submit = useCallback(() => {
    if (quote.kind !== "ready" || place.kind === "placing" || contact.kind !== "ready") return;
    const contactPhone = contact.phone;
    if (contact.required && contactPhone === undefined) return;
    const payingWithDzd = parseTender(tender);
    const identity = [quote.quote.quoteId, payingWithDzd, contactPhone, locale].join("\u0000");
    if (placementKey.current?.identity !== identity)
      placementKey.current = { identity, key: crypto.randomUUID() };
    const { key } = placementKey.current;
    setPlace({ kind: "placing" });
    const placement = {
      quoteId: quote.quote.quoteId,
      ...(payingWithDzd !== undefined && { payingWithDzd }),
      ...(contactPhone === undefined ? {} : { contactPhone }),
      locale: orderLocale,
    };
    void placeOrder(placement, key).then((result) => {
      setPlace(result);
      if (result.kind === "placed") {
        buzz("placed");
        basket.save(null);
      }
      if (result.kind === "expired") setQuoteAttempt((value) => value + 1);
      if (result.kind === "contact-required") contact.retry();
    });
  }, [quote, place.kind, tender, contact, locale, orderLocale, basket]);

  return {
    cart: isRestored ? cart : undefined,
    step,
    fulfilment,
    addresses,
    addressId,
    slots,
    slot,
    quote,
    tender,
    contact,
    place,
    pin,
    setStep,
    setFulfilment,
    setAddressId,
    addAddress,
    setSlot,
    setTender,
    retryQuote: () => {
      setQuoteAttempt((value) => value + 1);
    },
    submit,
  };
}
