"use client";

import { StateArt } from "../customer/state-art";
import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Skeleton,
  type BadgeTone,
} from "@zaafran/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { Favourite, OrderSummary, Receipt } from "./orders-http";
import { useMyOrders, type MyOrdersState } from "./use-my-orders";

type Status = OrderSummary["status"];
const statusTones: Readonly<Record<Status, BadgeTone>> = {
  scheduled: "info",
  pending_acceptance: "warning",
  accepted: "info",
  ready: "info",
  out_for_delivery: "info",
  delivered: "success",
  collected: "success",
  rejected: "danger",
  expired: "neutral",
  cancelled: "neutral",
  delivery_failed: "danger",
};
const canReorder: ReadonlySet<Status> = new Set([
  "delivered",
  "collected",
  "cancelled",
  "rejected",
  "expired",
]);

function Money({ amountDzd, locale }: { amountDzd: number; locale: Locale }) {
  return <bdi className="billing-money">{formatDzd(amountDzd, locale)}</bdi>;
}

/** Generated placeholder until restaurant covers are served: the initial on the saffron tile. */
function CoverTile({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span className={`orders-cover orders-cover-${size}`} aria-hidden="true">
      {Array.from(name)[0] ?? ""}
    </span>
  );
}

function pickName(
  names: Readonly<{ ar?: string | undefined; fr?: string | undefined; en?: string | undefined }>,
  locale: Locale,
): string {
  const key = locale === "ar" || locale === "fr" || locale === "en" ? locale : "fr";
  return names[key] ?? names.fr ?? names.ar ?? names.en ?? "";
}

function FavouriteCard({ favourite, state }: { favourite: Favourite; state: MyOrdersState }) {
  const translate = useTranslations("retentionOrders");
  return (
    <li className="orders-favourite">
      <CoverTile name={favourite.name} size="lg" />
      <div className="orders-favourite-text">
        <p className="billing-row-title">{favourite.name}</p>
        <Badge tone={favourite.isOpen ? "success" : "neutral"}>
          {translate(favourite.isOpen ? "open" : "closed")}
        </Badge>
      </div>
      <button
        type="button"
        className="ui-icon-button orders-heart"
        aria-pressed="true"
        aria-label={translate("removeFavourite", { name: favourite.name })}
        onClick={() => {
          void state.toggleFavourite(favourite.merchantId, false);
        }}
      >
        <Icon name="heart" />
      </button>
    </li>
  );
}

function Favourites({ state }: { state: MyOrdersState }) {
  const translate = useTranslations("retentionOrders");
  const { favourites } = state;
  if (favourites.kind === "loading") return <Skeleton label={translate("loading")} lines={2} />;
  if (favourites.kind !== "ready") return null;
  return (
    <Card title={translate("favourites")} titleId="orders-favourites">
      {favourites.restaurants.length === 0 ? (
        <EmptyState
          icon="heart"
          title={translate("noFavourites")}
          body={translate("noFavouritesBody")}
        />
      ) : (
        <ul className="orders-favourites">
          {favourites.restaurants.map((favourite) => (
            <FavouriteCard key={favourite.merchantId} favourite={favourite} state={state} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReceiptView({ receipt, locale }: { receipt: Receipt; locale: Locale }) {
  const translate = useTranslations("retentionOrders");
  return (
    <div className="orders-receipt">
      <ul className="orders-receipt-lines">
        {receipt.lines.map((line) => (
          <li key={line.itemId}>
            <span>
              {translate("lineQuantity", { count: line.quantity })} {pickName(line.names, locale)}
              {line.options.map((option) => (
                <span key={option.optionId} className="orders-receipt-option">
                  {translate("optionLine", {
                    name: pickName(option.names, locale),
                    amount: formatDzd(option.priceDeltaDzd, locale),
                  })}
                </span>
              ))}
            </span>
            <Money amountDzd={line.lineTotalDzd} locale={locale} />
          </li>
        ))}
      </ul>
      <dl className="promotion-receipt">
        <dt>{translate("subtotal")}</dt>
        <dd>
          <Money amountDzd={receipt.subtotalDzd} locale={locale} />
        </dd>
        {receipt.discountDzd > 0 && (
          <>
            <dt>{translate("discount")}</dt>
            <dd className="promotion-receipt-saving">
              {translate("saving", { amount: formatDzd(receipt.discountDzd, locale) })}
            </dd>
          </>
        )}
        <dt>{translate("deliveryFee")}</dt>
        <dd>
          <Money amountDzd={receipt.deliveryFeeDzd} locale={locale} />
        </dd>
        <dt className="promotion-receipt-total">{translate("total")}</dt>
        <dd className="promotion-receipt-total">
          <Money amountDzd={receipt.totalDzd} locale={locale} />
        </dd>
      </dl>
      <Button
        variant="ghost"
        size="sm"
        icon="print"
        onClick={() => {
          window.print();
        }}
      >
        {translate("print")}
      </Button>
    </div>
  );
}

function ReorderSummary({ state, locale }: { state: MyOrdersState; locale: Locale }) {
  const translate = useTranslations("retentionOrders");
  const pending = state.reorderResult;
  if (pending === undefined) return null;
  const { result, order } = pending;
  if (result.kind === "loading") return <Skeleton label={translate("loading")} lines={2} />;
  if (result.kind !== "ready") return <ErrorState title={translate("reorderError")} />;
  const { unavailable, priceChanges } = result.reorder;
  return (
    <Card
      title={translate("reorderTitle", { name: order.restaurantName })}
      titleId="orders-reorder"
      tone="sunken"
    >
      {unavailable.length === 0 && priceChanges.length === 0 && <p>{translate("reorderSame")}</p>}
      {unavailable.length > 0 && (
        <Badge tone="warning">{translate("unavailableCount", { count: unavailable.length })}</Badge>
      )}
      {priceChanges.length > 0 && (
        <ul className="orders-price-changes">
          {priceChanges.map((change) => (
            <li key={change.itemId}>
              {translate("priceChanged", {
                old: formatDzd(change.oldDzd, locale),
                new: formatDzd(change.newDzd, locale),
              })}
            </li>
          ))}
        </ul>
      )}
      {/* TODO(M6-2): hand the draft to lane A's cart once the cart route exists. */}
      <Button variant="primary" size="lg" isBlock disabled>
        {translate("continueToCart")}
      </Button>
    </Card>
  );
}

function ReceiptSlot({
  state,
  orderId,
  locale,
}: {
  state: MyOrdersState;
  orderId: string;
  locale: Locale;
}) {
  const translate = useTranslations("retentionOrders");
  const receipt = state.receipt?.orderId === orderId ? state.receipt.result : undefined;
  if (receipt === undefined) return null;
  if (receipt.kind === "loading") return <Skeleton label={translate("loading")} lines={3} />;
  if (receipt.kind === "ready") return <ReceiptView receipt={receipt.receipt} locale={locale} />;
  return <ErrorState title={translate("receiptError")} />;
}

function OrderCard({
  order,
  state,
  locale,
}: {
  order: OrderSummary;
  state: MyOrdersState;
  locale: Locale;
}) {
  const translate = useTranslations("retentionOrders");
  const format = useFormatter();
  const isReceiptOpen = state.receipt?.orderId === order.orderId;
  return (
    <li className="orders-card">
      <div className="orders-card-head">
        <CoverTile name={order.restaurantName} />
        <div className="billing-row-main">
          <p className="billing-row-title">
            {order.restaurantName}
            <Money amountDzd={order.totalDzd} locale={locale} />
          </p>
          <p className="billing-row-meta">
            <Badge tone={statusTones[order.status]}>{translate(`status_${order.status}`)}</Badge>
            <bdi dir="ltr" className="promotion-code">
              {order.shortCode}
            </bdi>
            <time dateTime={order.placedAt}>
              {format.dateTime(new Date(order.placedAt), {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
                timeZone: "Africa/Algiers",
              })}
            </time>
          </p>
        </div>
      </div>
      <div className="review-card-actions">
        <Button
          variant="ghost"
          size="sm"
          icon="receipt"
          aria-expanded={isReceiptOpen}
          onClick={() => {
            state.showReceipt(isReceiptOpen ? undefined : order.orderId);
          }}
        >
          {translate(isReceiptOpen ? "hideReceipt" : "receipt")}
        </Button>
        {canReorder.has(order.status) && (
          <Button
            variant="primary"
            size="sm"
            icon="repeat"
            onClick={() => {
              void state.orderAgain(order);
            }}
          >
            {translate("orderAgain")}
          </Button>
        )}
      </div>
      <ReceiptSlot state={state} orderId={order.orderId} locale={locale} />
    </li>
  );
}

function History({ state, locale }: { state: MyOrdersState; locale: Locale }) {
  const translate = useTranslations("retentionOrders");
  const { history } = state;
  if (history.kind === "loading") return <Skeleton label={translate("loading")} lines={6} />;
  if (history.kind !== "ready") {
    return history.kind === "error" ? (
      <ErrorState
        title={translate("loadError")}
        retryLabel={translate("retry")}
        onRetry={state.refresh}
      />
    ) : (
      <ErrorState title={translate(failureKeys[history.kind])} />
    );
  }
  if (history.orders.length === 0) {
    return (
      <Card>
        <EmptyState
          art={<StateArt kind="bag" />}
          title={translate("noOrders")}
          body={translate("noOrdersBody")}
        />
      </Card>
    );
  }
  return (
    <>
      <ul className="review-list">
        {history.orders.map((order) => (
          <OrderCard key={order.orderId} order={order} state={state} locale={locale} />
        ))}
      </ul>
      {history.nextCursor !== null && (
        <Button
          variant="secondary"
          isLoading={state.isPaging}
          onClick={() => {
            void state.loadMore();
          }}
        >
          {translate("loadMore")}
        </Button>
      )}
    </>
  );
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "loadError",
  error: "loadError",
} as const;

/** CUS-21 / CUS-23 view (page and design gallery). */
export function MyOrdersView({ state, locale }: { state: MyOrdersState; locale: Locale }) {
  const translate = useTranslations("retentionOrders");
  return (
    <section className="billing-page" aria-labelledby="orders-title">
      <PageHeader title={translate("title")} intro={translate("intro")} titleId="orders-title" />
      <Favourites state={state} />
      <ReorderSummary state={state} locale={locale} />
      <History state={state} locale={locale} />
    </section>
  );
}

/** CUS-21 / CUS-23: order history with receipts and reorder, plus favourite restaurants. */
export function MyOrders({ locale }: { locale: Locale }) {
  return <MyOrdersView state={useMyOrders()} locale={locale} />;
}
