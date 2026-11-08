"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { pitchComparison, pitchRanges } from "./pitch";

function Slider(props: {
  label: string;
  value: number;
  display: string;
  range: { min: number; max: number; step: number };
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="pitch-slider">
      <label htmlFor={id}>{props.label}</label>
      <output htmlFor={id}>{props.display}</output>
      <input
        id={id}
        type="range"
        min={props.range.min}
        max={props.range.max}
        step={props.range.step}
        value={props.value}
        aria-valuetext={props.display}
        onChange={(event) => {
          props.onChange(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}

function Bar(props: {
  label: string;
  amountDzd: number;
  maxDzd: number;
  tone: "commission" | "flat";
  locale: Locale;
}) {
  // Bars scale against the highest commission so the flat fee looks as small as it is.
  const share = props.maxDzd === 0 ? 0 : Math.max(0.01, props.amountDzd / props.maxDzd);
  return (
    <li className={`pitch-bar pitch-bar-${props.tone}`}>
      <span className="pitch-bar-label">{props.label}</span>
      {/* SVG geometry attributes, not inline styles, so the strict CSP still allows the width. */}
      <svg
        className="pitch-bar-track"
        viewBox="0 0 100 4"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect className="pitch-bar-fill" x={0} y={0} height={4} width={share * 100} rx={2} />
      </svg>
      <span className="pitch-bar-amount">{formatDzd(props.amountDzd, props.locale)}</span>
    </li>
  );
}

/** DESIGN §7.1-8: sliders for orders/day and average ticket; bars compare commission vs flat fee. */
export function PitchCalculator({ locale, flatFeeDzd }: { locale: Locale; flatFeeDzd: number }) {
  const translate = useTranslations("marketingPitch");
  const [ordersPerDay, setOrdersPerDay] = useState<number>(pitchRanges.ordersPerDay.initial);
  const [averageTicketDzd, setAverageTicketDzd] = useState<number>(
    pitchRanges.averageTicketDzd.initial,
  );
  const result = pitchComparison({ ordersPerDay, averageTicketDzd, flatFeeDzd });
  return (
    <section className="pitch-calculator" aria-labelledby="pitch-calculator-title">
      <h2 id="pitch-calculator-title">{translate("calculatorTitle")}</h2>
      <Slider
        label={translate("ordersPerDay")}
        value={ordersPerDay}
        display={translate("ordersValue", { count: ordersPerDay })}
        range={pitchRanges.ordersPerDay}
        onChange={setOrdersPerDay}
      />
      <Slider
        label={translate("averageTicket")}
        value={averageTicketDzd}
        display={formatDzd(averageTicketDzd, locale)}
        range={pitchRanges.averageTicketDzd}
        onChange={setAverageTicketDzd}
      />
      <ul className="pitch-bars" aria-live="polite">
        <Bar
          label={translate("commissionHigh")}
          amountDzd={result.commissionHighDzd}
          maxDzd={result.commissionHighDzd}
          tone="commission"
          locale={locale}
        />
        <Bar
          label={translate("commissionLow")}
          amountDzd={result.commissionLowDzd}
          maxDzd={result.commissionHighDzd}
          tone="commission"
          locale={locale}
        />
        <Bar
          label={translate("flatBar")}
          amountDzd={result.flatFeeDzd}
          maxDzd={result.commissionHighDzd}
          tone="flat"
          locale={locale}
        />
      </ul>
      <p className="pitch-savings">
        {translate("savings", { amount: formatDzd(result.savingsLowDzd, locale) })}
      </p>
    </section>
  );
}
