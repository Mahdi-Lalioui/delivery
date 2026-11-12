"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BoardActions } from "./board-actions";
import type { Ticket } from "./board-http";
import { dishName } from "./dish-name";

function Countdown({ deadline, now }: { deadline: number; now: number }) {
  const t = useTranslations("merchantBoard");
  const [duration] = useState(() => Math.max(1, deadline - now));
  const remaining = Math.max(0, deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const secondText = String(seconds % 60).padStart(2, "0");
  const clock = String(minutes) + ":" + secondText;
  const progress = Math.min(100, (remaining * 100) / duration);
  return (
    <div className="board-countdown" data-urgent={remaining <= 60_000}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" pathLength="100" />
        <circle
          cx="24"
          cy="24"
          r="21"
          pathLength="100"
          strokeDasharray={String(progress) + " 100"}
        />
      </svg>
      <bdi aria-label={remaining === 0 ? t("timedOut") : undefined}>{clock}</bdi>
    </div>
  );
}

export function BoardTicket({
  ticket,
  locale,
  now,
  offline,
  refresh,
}: {
  ticket: Ticket;
  locale: Locale;
  now: number;
  offline: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("merchantBoard");
  const deadline =
    ticket.status === "pending_acceptance" && ticket.acceptanceDeadlineAt !== null
      ? Date.parse(ticket.acceptanceDeadlineAt)
      : null;

  return (
    <article className="board-ticket" data-status={ticket.status}>
      <div className="board-ticket-heading">
        <div>
          <h3>
            <bdi>{ticket.shortCode}</bdi>
          </h3>
          <span className="board-mode" data-pickup={ticket.fulfilment === "pickup"}>
            {t(ticket.fulfilment)}
          </span>
        </div>
        {deadline !== null && <Countdown deadline={deadline} now={now} />}
      </div>
      {ticket.confirmByPhone && <p className="board-warning">{t("confirmByPhone")}</p>}
      <ul className="board-lines">
        {ticket.lines.map(({ itemId, names, quantity, options, note }, index) => (
          <li key={itemId + ":" + String(index)}>
            <bdi className="board-quantity">{t("quantity", { count: String(quantity) })}</bdi>
            <div>
              <strong>
                <bdi>{dishName(names, locale)}</bdi>
              </strong>
              {options.length > 0 && (
                <p>
                  <bdi>{options.map((name) => dishName(name, locale)).join(" · ")}</bdi>
                </p>
              )}
              {note && (
                <p>
                  <bdi>{note}</bdi>
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <dl className="board-cash">
        <div>
          <dt>{t("cashDue")}</dt>
          <dd>
            <bdi>{formatDzd(ticket.totalDzd, locale)}</bdi>
          </dd>
        </div>
        {ticket.changeDzd > 0 && (
          <div>
            <dt>{t("change")}</dt>
            <dd>
              <bdi>{formatDzd(ticket.changeDzd, locale)}</bdi>
            </dd>
          </div>
        )}
      </dl>
      <BoardActions
        ticket={ticket}
        locale={locale}
        refresh={refresh}
        disabled={offline || (deadline !== null && now >= deadline)}
      />
    </article>
  );
}
