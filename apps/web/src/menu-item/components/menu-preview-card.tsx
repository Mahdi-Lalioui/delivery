import { getLocalizedContent } from "@zaafran/i18n/content";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  readMenuPreviewDetail,
  type PreviewFailure,
  type PreviewItem,
  type PreviewScope,
} from "../menu-preview-http";
import { itemTags } from "./menu-item-form";
import { MenuPreviewOptions } from "./menu-preview-options";

type OnFailure = (failure: Exclude<PreviewFailure, "error">) => void;
type DetailProps = PreviewScope & {
  itemId: string;
  locale: Locale;
  onFailure: OnFailure;
};
type DetailRead = Awaited<ReturnType<typeof readMenuPreviewDetail>>;

function ItemPreviewDetail({ merchantId, expected, itemId, locale, onFailure }: DetailProps) {
  const t = useTranslations("menuPreview");
  const [detail, setDetail] = useState<DetailRead>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readMenuPreviewDetail({ merchantId, expected, itemId, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.kind === "ready" || result.kind === "error") setDetail(result);
        else onFailure(result.kind);
      },
    );
    return () => {
      controller.abort();
    };
  }, [merchantId, expected, itemId, attempt, onFailure]);

  if (!detail) return <p role="status">{t("loadingDetail")}</p>;
  if (detail.kind === "ready") {
    return <MenuPreviewOptions groups={detail.data.optionGroups} locale={locale} />;
  }
  return (
    <>
      <p role="alert">{t("detailError")}</p>
      <button
        className="menu-item-secondary"
        type="button"
        onClick={() => {
          setDetail(undefined);
          setAttempt((value) => value + 1);
        }}
      >
        {t("retry")}
      </button>
    </>
  );
}

function DishPlaceholder() {
  return (
    <svg
      className="menu-preview-photo menu-preview-placeholder"
      viewBox="0 0 320 240"
      aria-hidden="true"
    >
      <ellipse className="menu-preview-plate-shadow" cx="163" cy="133" rx="93" ry="75" />
      <circle className="menu-preview-plate" cx="160" cy="120" r="82" />
      <circle className="menu-preview-plate-rim" cx="160" cy="120" r="65" />
      <path
        className="menu-preview-food"
        d="M118 129c-6-22 15-49 42-52 27-3 57 15 55 42-2 26-20 42-51 45-24 3-40-14-46-35Z"
      />
      <path className="menu-preview-garnish" d="M130 123c16-25 44-28 62-17-8 17-39 34-62 17Z" />
      <path className="menu-preview-garnish" d="M157 143c11-15 24-19 37-16-1 14-17 23-37 16Z" />
      <circle className="menu-preview-spice" cx="145" cy="105" r="5" />
      <circle className="menu-preview-spice" cx="170" cy="118" r="4" />
      <circle className="menu-preview-spice" cx="181" cy="145" r="5" />
    </svg>
  );
}

function CardPhoto({ photoId }: { photoId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <DishPlaceholder />;
  return (
    <img
      className="menu-preview-photo"
      src={`/v1/media/${encodeURIComponent(photoId)}/variants/webp/320`}
      width={320}
      height={240}
      loading="lazy"
      decoding="async"
      alt=""
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

function PreviewTags({ tags }: { tags: PreviewItem["tags"] }) {
  const t = useTranslations("menuItem");
  if (tags.length === 0) return null;
  return (
    <ul className="menu-item-tags" role="list" aria-label={t("tags")}>
      {itemTags
        .filter(([tag]) => tags.includes(tag))
        .map(([tag, label]) => (
          <li key={tag}>{t(label)}</li>
        ))}
    </ul>
  );
}

export function MenuPreviewCard({
  item,
  locale,
  ...scope
}: PreviewScope & { item: PreviewItem; locale: Locale; onFailure: OnFailure }) {
  const t = useTranslations("menuPreview");
  const translateItem = useTranslations("menuItem");
  const [expanded, setExpanded] = useState(false);
  const name = getLocalizedContent(item.names, locale) ?? "";
  const id = `menu-preview-item-${item.itemId}`;
  const detailsId = `${id}-details`;
  return (
    <li className="menu-preview-card">
      {item.photoId ? <CardPhoto photoId={item.photoId} /> : <DishPlaceholder />}
      <div className="menu-preview-card-body">
        <h4 id={id} tabIndex={-1}>
          <bdi>{name}</bdi>
        </h4>
        <p className="menu-item-hint" dir="auto">
          {getLocalizedContent(item.descriptions, locale)}
        </p>
        <p className="menu-item-price">
          <bdi>{formatDzd(item.priceDzd, locale)}</bdi>
        </p>
        {!item.isAvailable && (
          <p className="menu-item-status" data-available={false}>
            {translateItem("stockSoldOut")}
          </p>
        )}
        <PreviewTags tags={item.tags} />
        <button
          className="menu-item-secondary menu-preview-quiet"
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={t("details", { name })}
          onClick={() => {
            setExpanded((previous) => !previous);
          }}
        >
          {t("showDetails")}
        </button>
        <div id={detailsId} hidden={!expanded}>
          {expanded && <ItemPreviewDetail {...scope} itemId={item.itemId} locale={locale} />}
        </div>
      </div>
    </li>
  );
}
