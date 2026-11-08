import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { getMessages } from "@zaafran/i18n/messages";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { orderRatingOutput } from "@zaafran/contracts/ratings";
import { SiteShell } from "../components/site-shell";
import "../admin/admin-merchant.css";
import "../admin/billing/admin-billing.css";
import { MerchantReviews } from "./merchant-reviews";
import { OrderRating } from "./order-rating";
import { PromotionsEditor } from "./promotions-editor";
import { ShareKit, type PosterCopy } from "./share-kit";
import "./retention.css";

export async function requireOrderId(params: Promise<{ orderId: string }>): Promise<string> {
  const result = orderRatingOutput.shape.orderId.safeParse((await params).orderId);
  if (!result.success) notFound();
  return result.data.toLowerCase();
}

export async function ratingMetadata(
  locale: Locale,
  key: "title" | "reviewsTitle",
): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "retentionRatings" });
  return { title: translate(key), robots: { index: false, follow: false } };
}

function Messages({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={localeDetails[locale].tag}
      timeZone="Africa/Algiers"
      messages={{ retentionRatings: getMessages(locale).retentionRatings }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/** The order page links here with `?fulfilment=pickup` for pickup orders (no delivery stars). */
export function OrderRatingPage(props: { orderId: string; locale: Locale; isDelivery: boolean }) {
  return (
    <SiteShell locale={props.locale} subpath={`/orders/${props.orderId}/rating`}>
      <Messages locale={props.locale}>
        <OrderRating key={props.orderId} orderId={props.orderId} isDelivery={props.isDelivery} />
      </Messages>
    </SiteShell>
  );
}

export function MerchantReviewsPage({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/reviews`}>
      <Messages locale={locale}>
        <MerchantReviews key={merchantId} merchantId={merchantId} />
      </Messages>
    </SiteShell>
  );
}

export async function promotionsMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "retentionPromotions" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

export function PromotionsPage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/promotions`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        timeZone="Africa/Algiers"
        messages={{ retentionPromotions: getMessages(locale).retentionPromotions }}
      >
        <PromotionsEditor key={merchantId} merchantId={merchantId} />
      </NextIntlClientProvider>
    </SiteShell>
  );
}

export async function shareMetadata(locale: Locale): Promise<Metadata> {
  const translate = await getTranslations({ locale, namespace: "retentionShare" });
  return { title: translate("title"), robots: { index: false, follow: false } };
}

function posterCopy(locale: "ar" | "fr"): PosterCopy {
  const { retentionShare } = getMessages(locale);
  return {
    headline: retentionShare.posterHeadline,
    scan: retentionShare.posterScan,
    dir: locale === "ar" ? "rtl" : "ltr",
    lang: locale,
  };
}

export function SharePage({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return (
    <SiteShell locale={locale} subpath={`/merchant/${merchantId}/share`}>
      <NextIntlClientProvider
        locale={localeDetails[locale].tag}
        messages={{ retentionShare: getMessages(locale).retentionShare }}
      >
        <ShareKit
          key={merchantId}
          merchantId={merchantId}
          posters={{ ar: posterCopy("ar"), fr: posterCopy("fr") }}
        />
      </NextIntlClientProvider>
    </SiteShell>
  );
}
