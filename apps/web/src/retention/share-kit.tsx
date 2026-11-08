"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { listMerchantMemberships } from "../merchant/merchant-http";
import { qrSvgPath, shareUrl } from "./qr";

export type PosterCopy = { headline: string; scan: string; dir: "rtl" | "ltr"; lang: "ar" | "fr" };
type PaperSize = "A5" | "A4";

function QrImage({ url, label }: { url: string; label: string }) {
  const { size, path } = qrSvgPath(url);
  // A 4-module quiet zone keeps the code scannable when printed next to other content.
  const box = size + 8;
  return (
    <svg
      className="share-qr"
      viewBox={`-4 -4 ${String(box)} ${String(box)}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-4} y={-4} width={box} height={box} className="share-qr-light" />
      <path d={path} className="share-qr-dark" />
    </svg>
  );
}

function useRestaurantName(merchantId: string): string | undefined {
  const [name, setName] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void listMerchantMemberships(controller.signal).then((result) => {
      if (result.kind !== "ready") return;
      setName(result.data.memberships.find((row) => row.merchantId === merchantId)?.restaurantName);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId]);
  return name;
}

function Poster(props: { url: string; name: string; copy: PosterCopy; paper: PaperSize }) {
  return (
    <article
      className={`share-poster share-poster-${props.paper.toLowerCase()}`}
      lang={props.copy.lang}
      dir={props.copy.dir}
    >
      <h2>{props.name}</h2>
      <p className="share-poster-headline">{props.copy.headline}</p>
      <QrImage url={props.url} label={props.copy.scan} />
      <p>{props.copy.scan}</p>
      <p dir="ltr">
        <bdi>{props.url}</bdi>
      </p>
    </article>
  );
}

/** MER-24: QR code, short link and a printable A5/A4 poster in Arabic or French. */
export function ShareKit(props: {
  merchantId: string;
  posters: { ar: PosterCopy; fr: PosterCopy };
}) {
  const translate = useTranslations("retentionShare");
  const name = useRestaurantName(props.merchantId);
  const [origin, setOrigin] = useState<string>();
  const [language, setLanguage] = useState<"ar" | "fr">("ar");
  const [paper, setPaper] = useState<PaperSize>("A5");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  if (origin === undefined) return <p role="status">{translate("loading")}</p>;
  const url = shareUrl(origin, props.merchantId);
  return (
    <section className="admin-merchant" aria-labelledby="share-title">
      <header className="admin-merchant-heading share-no-print">
        <h1 id="share-title">{translate("title")}</h1>
        <p>{translate("intro")}</p>
      </header>
      <div className="share-no-print admin-merchant-form">
        <label className="admin-merchant-field">
          <span>{translate("link")}</span>
          <input
            readOnly
            value={url}
            dir="ltr"
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        </label>
        <label className="admin-merchant-field">
          <span>{translate("posterLanguage")}</span>
          <select
            value={language}
            onChange={(event) => {
              setLanguage(event.currentTarget.value === "fr" ? "fr" : "ar");
            }}
          >
            <option value="ar">{translate("arabic")}</option>
            <option value="fr">{translate("french")}</option>
          </select>
        </label>
        <label className="admin-merchant-field">
          <span>{translate("paper")}</span>
          <select
            value={paper}
            onChange={(event) => {
              setPaper(event.currentTarget.value === "A4" ? "A4" : "A5");
            }}
          >
            <option value="A5">{translate("a5")}</option>
            <option value="A4">{translate("a4")}</option>
          </select>
        </label>
        <button
          className="admin-merchant-button"
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          {translate("print")}
        </button>
      </div>
      <Poster url={url} name={name ?? ""} copy={props.posters[language]} paper={paper} />
    </section>
  );
}
