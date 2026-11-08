"use client";

import {
  Button,
  Card,
  IconButton,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TextField,
  useToast,
} from "@zaafran/ui";
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

function ShareControls(props: {
  url: string;
  language: "ar" | "fr";
  paper: PaperSize;
  onLanguage: (value: "ar" | "fr") => void;
  onPaper: (value: PaperSize) => void;
}) {
  const translate = useTranslations("retentionShare");
  const toast = useToast();
  return (
    <Card title={translate("settingsTitle")} titleId="share-settings">
      <div className="share-link">
        <TextField
          label={translate("link")}
          readOnly
          value={props.url}
          dir="ltr"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <IconButton
          icon="copy"
          label={translate("copy")}
          onClick={() => {
            void navigator.clipboard.writeText(props.url).then(() => {
              toast.show(translate("copied"));
            });
          }}
        />
      </div>
      <SegmentedControl
        legend={translate("posterLanguage")}
        name="poster-language"
        value={props.language}
        onChange={props.onLanguage}
        options={[
          { value: "ar", label: translate("arabic") },
          { value: "fr", label: translate("french") },
        ]}
      />
      <SegmentedControl
        legend={translate("paper")}
        name="poster-paper"
        value={props.paper}
        onChange={props.onPaper}
        options={[
          { value: "A5", label: translate("a5") },
          { value: "A4", label: translate("a4") },
        ]}
      />
      <Button
        variant="primary"
        size="lg"
        icon="print"
        isBlock
        onClick={() => {
          window.print();
        }}
      >
        {translate("print")}
      </Button>
    </Card>
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
  if (origin === undefined) return <Skeleton label={translate("loading")} lines={4} />;
  const url = shareUrl(origin, props.merchantId);
  return (
    <section className="billing-page" aria-labelledby="share-title">
      <div className="share-no-print">
        <PageHeader title={translate("title")} intro={translate("intro")} titleId="share-title" />
      </div>
      <div className="share-layout">
        <div className="share-no-print">
          <ShareControls
            url={url}
            language={language}
            paper={paper}
            onLanguage={setLanguage}
            onPaper={setPaper}
          />
        </div>
        <Poster url={url} name={name ?? ""} copy={props.posters[language]} paper={paper} />
      </div>
    </section>
  );
}
