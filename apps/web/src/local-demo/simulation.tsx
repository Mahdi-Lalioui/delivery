"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@zaafran/ui";
import { getCartSummary } from "@zaafran/domain/cart";
import { CountdownRing } from "../marketing/moments/countdown-ring";
import { flyToCart } from "../marketing/moments/fly-to-cart";
import { LivePill } from "../marketing/moments/live-pill";
import { OdometerNumber } from "../marketing/moments/odometer-number";
import { TagineMoment } from "../marketing/moments/tagine-moment";
import { useBrowserCart } from "../restaurant/use-browser-cart";
import type { TourLocale } from "./tour-stops";
import "@zaafran/ui/ui.css";
import "../marketing/moments/moments.css";
import "./tour.css";

const labels = {
  fr: {
    title: "Simulation de commande",
    notice: "Cette simulation reste dans votre navigateur.",
    place: "Passer la commande simulée",
    empty: "Ajoutez un plat depuis le restaurant.",
    back: "Revenir à la carte",
    rate: "Évaluer la livraison",
    rated: "Merci pour votre avis de démonstration.",
    stars: "Étoiles",
    next: "Prochaine étape",
    live: "En direct",
    currency: "DA",
    steps: ["Acceptée", "En préparation", "En route", "Livrée"],
  },
  ar: {
    title: "محاكاة الطلب",
    notice: "تظلّ هذه المحاكاة في متصفّحك.",
    place: "إرسال الطلب التجريبي",
    empty: "أضف طبقًا من قائمة المطعم.",
    back: "العودة إلى القائمة",
    rate: "قيّم التوصيل",
    rated: "شكرًا على تقييمك التجريبي.",
    stars: "نجوم",
    next: "المرحلة التالية",
    live: "مباشر",
    currency: "دج",
    steps: ["تم قبول الطلب", "قيد التحضير", "في الطريق", "تم التوصيل"],
  },
};
const starSymbol = " ★";
const stageMs = 5000;
const done = () => undefined;

function Rating({ locale }: { locale: TourLocale }) {
  const copy = labels[locale];
  const [rating, setRating] = useState(0);
  return (
    <section>
      <h2>{copy.rate}</h2>
      <div className="demo-tour-switch">
        {[1, 2, 3, 4, 5].map((stars) => (
          <button
            key={stars}
            type="button"
            aria-label={`${String(stars)} ${copy.stars}`}
            aria-pressed={rating === stars}
            onClick={() => {
              setRating(stars);
            }}
          >
            {String(stars) + starSymbol}
          </button>
        ))}
      </div>
      <p role="status">{rating > 0 ? copy.rated : ""}</p>
    </section>
  );
}

export function LocalSimulation({ locale }: { locale: TourLocale }) {
  const copy = labels[locale];
  const { cart } = useBrowserCart();
  const summary = cart ? getCartSummary(cart) : null;
  const [started, setStarted] = useState<number>();
  const [elapsed, setElapsed] = useState(0);
  const source = useRef<HTMLSpanElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const stage = Math.min(3, Math.floor(elapsed / stageMs));
  useEffect(() => {
    if (started === undefined || stage === 3) return;
    const timer = window.setInterval(() => {
      setElapsed(Date.now() - started);
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [started, stage]);

  return (
    <main className="container demo-tour">
      <header className="demo-tour-head">
        <h1>{copy.title}</h1>
        <p>{copy.notice}</p>
        <div ref={target}>
          <LivePill label={copy.live} />
        </div>
      </header>
      {started === undefined ? (
        <section className="demo-tour-head">
          {summary?.ok === true ? (
            <>
              <span ref={source}>
                <OdometerNumber value={String(summary.value.subtotalDzd)} /> {copy.currency}
              </span>
              <Button
                variant="primary"
                onClick={() => {
                  if (source.current && target.current)
                    void flyToCart(source.current, target.current).catch(done);
                  setStarted(Date.now());
                }}
              >
                {copy.place}
              </Button>
            </>
          ) : (
            <p>{copy.empty}</p>
          )}
          <a href={`/${locale}/restaurants/tour-demo-lune-de-semoule`}>{copy.back}</a>
        </section>
      ) : (
        <section className="demo-tour-head">
          <h2 role="status">{copy.steps[stage]}</h2>
          <ol>
            {copy.steps.map((step, index) => (
              <li key={step} aria-current={index === stage ? "step" : undefined}>
                {step}
              </li>
            ))}
          </ol>
          {stage < 3 ? (
            <CountdownRing
              remainingMs={stageMs - (elapsed % stageMs)}
              totalMs={stageMs}
              label={copy.next}
            />
          ) : (
            <Rating locale={locale} />
          )}
          {stage === 0 && <TagineMoment label={copy.steps[0] ?? copy.title} onDone={done} />}
        </section>
      )}
    </main>
  );
}
