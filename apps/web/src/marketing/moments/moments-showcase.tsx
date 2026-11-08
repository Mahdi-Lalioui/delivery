"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import "@zaafran/ui/ui.css";
import "./moments.css";
import { CountdownRing } from "./countdown-ring";
import { flyToCart } from "./fly-to-cart";
import { LivePill } from "./live-pill";
import { OdometerNumber } from "./odometer-number";
import { TagineMoment } from "./tagine-moment";

const itemPriceDzd = 450;
const acceptWindowMs = 120_000;

/** Design-build page for M8-3 visual QA: every signature moment with its reduced-motion path. */
export function MomentsShowcase({ locale }: { locale: Locale }) {
  const translate = useTranslations("marketingMoments");
  const thumbnail = useRef<HTMLSpanElement>(null);
  const cart = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(0);
  const [tagineRun, setTagineRun] = useState(0);
  const [isTagineVisible, setIsTagineVisible] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [pinRun, setPinRun] = useState(0);
  return (
    <section className="admin-merchant" aria-labelledby="moments-title">
      <h1 id="moments-title">{translate("title")}</h1>
      <div className="moments-row">
        <span ref={thumbnail} className="pitch-cta">
          {translate("item")}
        </span>
        <button
          type="button"
          className="admin-merchant-button"
          onClick={() => {
            const source = thumbnail.current;
            const target = cart.current;
            setCount((value) => value + 1);
            if (source !== null && target !== null) void flyToCart(source, target);
          }}
        >
          {translate("addToCart")}
        </button>
        <span ref={cart}>{translate("cart", { count })}</span>
        <OdometerNumber value={formatDzd(count * itemPriceDzd, locale)} />
      </div>
      <div className="moments-row">
        <LivePill label={translate("live")} />
        <CountdownRing
          remainingMs={acceptWindowMs / 3}
          totalMs={acceptWindowMs}
          label={translate("timeLeft")}
        />
        <article
          className="pitch-calculator moment-new-order"
          data-acknowledged={String(isAcknowledged)}
        >
          <p>{translate("newOrder")}</p>
          <button
            type="button"
            className="admin-merchant-button"
            onClick={() => {
              setIsAcknowledged(true);
            }}
          >
            {translate("acknowledge")}
          </button>
        </article>
      </div>
      <div className="moments-row">
        <button
          type="button"
          className="admin-merchant-button"
          onClick={() => {
            setTagineRun((value) => value + 1);
            setIsTagineVisible(true);
          }}
        >
          {translate("confirmOrder")}
        </button>
        {isTagineVisible && (
          <TagineMoment
            key={tagineRun}
            label={translate("confirmed")}
            onDone={() => {
              setIsTagineVisible(false);
            }}
          />
        )}
        <button
          type="button"
          className="admin-merchant-button"
          onClick={() => {
            setPinRun((value) => value + 1);
          }}
        >
          {translate("dropPin")}
        </button>
        <span key={pinRun} className="moment-pin-drop pitch-cta">
          {translate("pin")}
        </span>
      </div>
    </section>
  );
}
