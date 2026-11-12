"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { BoardCourierTeam } from "./board-couriers";
import { BoardDeliveryProofs } from "./board-delivery-proofs";
import { BoardTicket } from "./board-ticket";
import type { Board } from "./board-http";
import { useBoardPresence } from "./use-board-presence";
import { useOrderBoard } from "./use-order-board";
import { useOrderSound } from "./use-order-sound";

const columns = [
  { status: "pending_acceptance", title: "new", empty: "emptyNew" },
  { status: "accepted", title: "preparing", empty: "emptyPreparing" },
  { status: "ready", title: "ready", empty: "emptyReady" },
] as const;

function BoardSkeleton() {
  const t = useTranslations("merchantBoard");
  return (
    <div className="board-grid" aria-busy="true" role="status" aria-label={t("loading")}>
      {columns.map(({ status }) => (
        <div key={status} className="board-column board-skeleton">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function BoardColumns({
  board,
  locale,
  offline,
  refresh,
}: {
  board: Board;
  locale: Locale;
  offline: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("merchantBoard");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="board-grid">
      {columns.map(({ status, title, empty }) => {
        const tickets = board.orders.filter((order) => order.status === status);
        return (
          <section
            className="board-column"
            data-status={status}
            key={status}
            aria-labelledby={"board-" + status}
          >
            <div className="board-column-heading">
              <h2 id={"board-" + status}>{t(title)}</h2>
              <bdi aria-label={t("columnCount")}>{tickets.length}</bdi>
            </div>
            {tickets.length === 0 ? (
              <p className="board-empty">{t(empty)}</p>
            ) : (
              tickets.map((ticket) => (
                <BoardTicket
                  key={ticket.orderId + ":" + String(ticket.version)}
                  ticket={ticket}
                  locale={locale}
                  now={now}
                  offline={offline}
                  refresh={refresh}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

function BoardBody({
  view,
  merchantId,
  locale,
  refresh,
}: {
  view: ReturnType<typeof useOrderBoard>["view"];
  merchantId: string;
  locale: Locale;
  refresh: () => void;
}) {
  const t = useTranslations("merchantBoard");
  switch (view.kind) {
    case "loading":
      return <BoardSkeleton />;
    case "unauthenticated":
      return (
        <a className="board-primary" href={`/${locale}/sign-in?continue=merchant-status`}>
          {t("signIn")}
        </a>
      );
    case "forbidden":
      return (
        <p role="alert" className="board-error">
          {t("forbidden")}
        </p>
      );
    case "error":
      return (
        <div className="board-state">
          <p role="alert" className="board-error">
            {t("loadError")}
          </p>
          <button type="button" className="board-secondary" onClick={refresh}>
            {t("retry")}
          </button>
        </div>
      );
    case "ready":
      return (
        <>
          {view.offline && (
            <p role="status" className="board-warning">
              {t("offline")}
            </p>
          )}
          <BoardCourierTeam merchantId={merchantId} locale={locale} offline={view.offline} />
          <BoardColumns
            board={view.data}
            locale={locale}
            offline={view.offline}
            refresh={refresh}
          />
          <BoardDeliveryProofs proofs={view.data.deliveryProofs ?? []} />
        </>
      );
  }
}

export function MerchantBoardScreen({
  merchantId,
  locale,
}: {
  merchantId: string;
  locale: Locale;
}) {
  const t = useTranslations("merchantBoard");
  const { view, refresh } = useOrderBoard(merchantId);
  const pending =
    view.kind === "ready"
      ? view.data.orders.filter(({ status }) => status === "pending_acceptance").length
      : 0;
  const online = view.kind === "ready" && !view.offline;
  const sound = useOrderSound(online && pending > 0);
  useBoardPresence(view.kind === "ready", pending);

  return (
    <div className="order-board">
      <header className="board-heading">
        <div>
          <a className="board-back" href={`/${locale}/merchant`}>
            {t("back")}
          </a>
          <h1>{t("heading")}</h1>
        </div>
        {view.kind === "ready" && (
          <button
            type="button"
            className="board-secondary board-sound"
            aria-pressed={sound.enabled}
            onClick={() => void sound.toggle()}
          >
            <span className="board-sound-dot" aria-hidden="true" />
            {t(sound.enabled ? "soundOn" : "soundOff")}
          </button>
        )}
      </header>
      {sound.unavailable && (
        <p role="status" className="board-warning">
          {t("soundUnavailable")}
        </p>
      )}
      <BoardBody view={view} merchantId={merchantId} locale={locale} refresh={refresh} />
    </div>
  );
}
