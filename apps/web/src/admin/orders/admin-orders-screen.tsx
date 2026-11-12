"use client";

import { adminOrderSearchInput } from "@zaafran/contracts/admin-orders";
import { formatAlgiersTime, formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { OrderFilters } from "./order-filters";
import { OrderTimeline } from "./order-timeline";
import type { AdminOrderPage, OrderQuery } from "./orders-http";
import { useAdminOrders } from "./use-admin-orders";

function OrderList({
  page,
  selected,
  locale,
  onSelect,
}: {
  page: AdminOrderPage;
  selected: string | undefined;
  locale: Locale;
  onSelect: (orderId: string) => void;
}) {
  const t = useTranslations("adminOrders");
  const orders = useTranslations("retentionOrders");
  if (!page.orders.length) return <EmptyState icon="receipt" title={t("empty")} />;
  return (
    <ul className="admin-orders-list" role="list">
      {page.orders.map(
        ({ orderId, shortCode, restaurantName, status, totalDzd, placedAt, fulfilment }) => (
          <li key={orderId}>
            <button
              type="button"
              className="admin-orders-ticket"
              aria-pressed={selected === orderId}
              onClick={() => {
                onSelect(orderId);
              }}
            >
              <span className="admin-orders-ticket-main">
                <strong>
                  <bdi>{restaurantName}</bdi>
                </strong>
                <span>
                  <bdi dir="ltr">{shortCode}</bdi> <span aria-hidden="true">{t("separator")}</span>{" "}
                  {t(fulfilment)}
                </span>
              </span>
              <span className="admin-orders-ticket-meta">
                <Badge>{orders(`status_${status}`)}</Badge>
                <span>
                  <bdi>{formatDzd(totalDzd, locale)}</bdi>{" "}
                  <span aria-hidden="true">{t("separator")}</span>{" "}
                  <time dateTime={placedAt}>
                    <bdi>{formatAlgiersTime(Date.parse(placedAt), locale)}</bdi>
                  </time>
                </span>
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function OrderPager({
  canGoBack,
  hasNext,
  onBack,
  onNext,
}: {
  canGoBack: boolean;
  hasNext: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("adminOrders");
  if (!canGoBack && !hasNext) return null;
  return (
    <div className="admin-orders-pager">
      {canGoBack && <Button onClick={onBack}>{t("previous")}</Button>}
      {hasNext && <Button onClick={onNext}>{t("next")}</Button>}
    </div>
  );
}

function AdminOrdersContent({ locale }: { locale: Locale }) {
  const t = useTranslations("adminOrders");
  const [query, setQuery] = useState(() => adminOrderSearchInput.parse({}));
  const [selected, setSelected] = useState<string>();
  const [history, setHistory] = useState<OrderQuery[]>([]);
  const { view, refresh, isOffline } = useAdminOrders(query);

  function reset(next: OrderQuery) {
    setSelected(undefined);
    setHistory([]);
    setQuery(next);
  }

  function advance(page: AdminOrderPage) {
    if (!page.nextCursor) return;
    setHistory((previous) => [...previous, query]);
    setQuery({ ...query, cursor: page.nextCursor });
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setQuery(previous);
  }

  if (view.kind === "unauthenticated" || view.kind === "forbidden")
    return (
      <EmptyState
        icon="user"
        title={t("signInRequired")}
        action={
          <ButtonLink href={`/${locale}/sign-in?continue=admin-orders`} variant="primary">
            {t("signIn")}
          </ButtonLink>
        }
      />
    );

  return (
    <>
      <OrderFilters query={query} onChange={reset} />
      {view.kind === "loading" && <Skeleton label={t("loading")} lines={5} />}
      {view.kind === "error" && (
        <ErrorState title={t("loadError")} retryLabel={t("refresh")} onRetry={refresh} />
      )}
      {view.kind === "ready" && (
        <div className="admin-orders-columns" data-selected={selected !== undefined}>
          <Card title={t("queue")} titleId="admin-orders-list">
            {isOffline && <p role="status">{t("queueOffline")}</p>}
            <OrderList
              page={view.data}
              selected={selected}
              locale={locale}
              onSelect={setSelected}
            />
            <OrderPager
              canGoBack={history.length > 0}
              hasNext={view.data.nextCursor !== null}
              onBack={goBack}
              onNext={() => {
                advance(view.data);
              }}
            />
          </Card>
          {selected && (
            <OrderTimeline
              key={selected}
              orderId={selected}
              sessionId={view.data.sessionId}
              locale={locale}
              onChange={refresh}
            />
          )}
        </div>
      )}
    </>
  );
}

export function AdminOrdersScreen({ locale }: { locale: Locale }) {
  const t = useTranslations("adminOrders");
  return (
    <div className="admin-orders-shell">
      <PageHeader title={t("title")} intro={t("intro")} titleId="admin-orders-title" />
      <AdminOrdersContent locale={locale} />
    </div>
  );
}
