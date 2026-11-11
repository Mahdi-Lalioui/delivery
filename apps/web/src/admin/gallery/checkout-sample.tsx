"use client";

import type { Cart } from "@zaafran/domain/cart";
import { dzd, type Dzd } from "@zaafran/domain/money";
import type { Locale } from "@zaafran/i18n/locales";
import { SegmentedControl } from "@zaafran/ui";
import { useState } from "react";
import { CheckoutView, OrderConfirmed } from "../../checkout/checkout-view";
import type { CheckoutState, CheckoutStep, FulfilmentKind } from "../../checkout/use-checkout";
import type { SlotChoice } from "../../retention/slot-picker";

type Mode = "ready" | "empty" | "loading" | "error";
type View = "1" | "2" | "3" | "confirmed";

function money(value: number): Dzd {
  const result = dzd(value);
  if (!result.ok) throw new RangeError("Fixture amounts are whole dinars");
  return result.value;
}

const steps = { "1": 1, "2": 2, "3": 3, confirmed: 3 } as const;
const views = { 1: "1", 2: "2", 3: "3" } as const;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = ([n, fr, ar, priceDzd, quantity]: [number, string, string, number, number]) => ({
  lineId: id(900 + n),
  itemId: id(800 + n),
  names: { fr, ar },
  unitPriceDzd: money(priceDzd),
  options: [],
  quantity,
  note: "",
});
const cart: Cart = {
  version: 1,
  merchant: { merchantId: id(30), name: "Dar Yemma", minimumDzd: 0 },
  expiresAt: Date.parse("2027-01-01T00:00:00Z"),
  lines: [
    line([1, "Couscous aux légumes", "كسكسي بالخضر", 1200, 1]),
    line([2, "Chorba frik", "شوربة فريك", 450, 2]),
    line([3, "Bourek à la viande", "بوراك باللحم", 300, 3]),
  ],
};
const address = ([n, label, building, isDefault]: [number, string, string, boolean]) => ({
  addressId: id(700 + n),
  label,
  building,
  pin: { latitude: 36.77, longitude: 3.06 },
  communeId: null,
  plusCode: "8CFX+2Q",
  isDefault,
});
const slots = ["19:30", "19:45", "20:00", "20:15", "20:30"].map((time) => ({
  kind: "scheduled" as const,
  scheduledFor: `2027-02-10T${time}:00+01:00`,
}));
const noop = () => undefined;

function fixture({
  mode,
  step,
  fulfilment,
  slot,
}: {
  mode: Mode;
  step: CheckoutStep;
  fulfilment: FulfilmentKind;
  slot: SlotChoice;
}) {
  const state: CheckoutState = {
    cart: mode === "loading" ? undefined : mode === "empty" ? null : cart,
    step,
    fulfilment,
    addresses: {
      kind: "ready",
      value: [
        address([1, "Maison", "12 rue Didouche Mourad, Alger Centre", true]),
        address([2, "Travail", "Tour Algeria Business Center, El Mouradia", false]),
      ],
    },
    addressId: id(701),
    slots: { kind: "ready", value: slots },
    slot,
    quote:
      mode === "error"
        ? { kind: "error" }
        : {
            kind: "ready",
            quote: {
              quoteId: id(600),
              fulfilment,
              expiresAt: "2027-02-10T19:10:00.000Z",
              subtotalDzd: 3000,
              deliveryFeeDzd: fulfilment === "delivery" ? 100 : 0,
              totalDzd: fulfilment === "delivery" ? 3100 : 3000,
            },
          },
    tender: step === 3 ? "5000" : "",
    place: { kind: "idle" },
    pin: { latitude: 36.77, longitude: 3.06 },
    setStep: noop,
    setFulfilment: noop,
    setAddressId: noop,
    addAddress: () => Promise.resolve(true),
    setSlot: noop,
    setTender: noop,
    retryQuote: noop,
    submit: noop,
  };
  return state;
}

/** CUS-13/14 checkout steps and the order-confirmed moment, with fixtures. */
export function CheckoutSample({
  mode,
  locale,
  initialView,
  isBare = false,
}: {
  mode: Mode;
  locale: Locale;
  initialView?: View;
  isBare?: boolean;
}) {
  const [view, setView] = useState<View>(initialView ?? (mode === "error" ? "3" : "1"));
  const [fulfilment, setFulfilment] = useState<FulfilmentKind>("delivery");
  const [slot, setSlot] = useState<SlotChoice>({ kind: "asap" });
  const state = {
    ...fixture({ mode, step: steps[view], fulfilment, slot }),
    setStep: (step: CheckoutStep) => {
      setView(views[step]);
    },
    setFulfilment,
    setSlot,
  };
  return (
    <div className={isBare ? undefined : "billing-layout"}>
      {!isBare && (
        <SegmentedControl
          legend="step"
          name="checkout-view"
          value={view}
          onChange={setView}
          options={[
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "confirmed", label: "✓" },
          ]}
        />
      )}
      {view === "confirmed" ? (
        <OrderConfirmed
          locale={locale}
          orderId={id(500)}
          shortCode="K7P-4QX"
          restaurant="Dar Yemma"
          redirectMs={null}
        />
      ) : (
        <CheckoutView state={state} locale={locale} />
      )}
    </div>
  );
}
