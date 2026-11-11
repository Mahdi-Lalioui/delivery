"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useRef, useState, type SubmitEvent } from "react";
import { submitBoardAction, type BoardAction, type RejectReason, type Ticket } from "./board-http";
import { dishName } from "./dish-name";

const presets = [10, 15, 20, 30, 45];
const reasons = [
  { value: "closed", label: "closed" },
  { value: "too_busy", label: "tooBusy" },
  { value: "item_unavailable", label: "unavailable" },
  { value: "other", label: "other" },
] as const;

type Controls = { disabled: boolean; send: (action: BoardAction) => void };

function AcceptOrder({ disabled, send }: Controls) {
  const t = useTranslations("merchantBoard");
  const [prep, setPrep] = useState("20");
  const [custom, setCustom] = useState(false);
  const minutes = Number(prep);
  const valid = Number.isInteger(minutes) && minutes >= 5 && minutes <= 120;

  return (
    <fieldset className="board-form">
      <legend>{t("prepTime")}</legend>
      <div className="board-choices">
        {presets.map((preset) => (
          <button
            type="button"
            key={preset}
            aria-pressed={!custom && minutes === preset}
            disabled={disabled}
            onClick={() => {
              setPrep(String(preset));
              setCustom(false);
            }}
          >
            <bdi>{preset}</bdi>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          disabled={disabled}
          onClick={() => {
            setCustom(true);
          }}
        >
          {t("custom")}
        </button>
      </div>
      {custom && (
        <label className="board-custom">
          <span>{t("minutes")}</span>
          <input
            type="number"
            min={5}
            max={120}
            value={prep}
            disabled={disabled}
            onChange={(event) => {
              setPrep(event.target.value);
            }}
          />
        </label>
      )}
      <button
        className="board-primary"
        type="button"
        disabled={disabled || !valid}
        onClick={() => {
          send({ kind: "accept", prepMinutes: minutes });
        }}
      >
        {t("accept")}
      </button>
    </fieldset>
  );
}

function RejectOrder({
  disabled,
  send,
  ticket,
  locale,
}: Controls & { ticket: Ticket; locale: Locale }) {
  const t = useTranslations("merchantBoard");
  const [reason, setReason] = useState<RejectReason>("too_busy");
  const [soldOut, setSoldOut] = useState<string[]>([]);
  const items = [...new Map(ticket.lines.map((line) => [line.itemId, line.names])).entries()];

  function toggleItem(id: string) {
    setSoldOut((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <details className="board-disclosure">
      <summary>{t("reject")}</summary>
      <fieldset className="board-form">
        <legend>{t("reason")}</legend>
        <div className="board-choices">
          {reasons.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={reason === value}
              disabled={disabled}
              onClick={() => {
                setReason(value);
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {reason === "item_unavailable" && (
          <fieldset className="board-form">
            <legend>{t("soldOut")}</legend>
            <div className="board-choices">
              {items.map(([id, names]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={soldOut.includes(id)}
                  disabled={disabled}
                  onClick={() => {
                    toggleItem(id);
                  }}
                >
                  <bdi>{dishName(names, locale)}</bdi>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <button
          className="board-danger"
          type="button"
          disabled={disabled}
          onClick={() => {
            send({
              kind: "reject",
              reason,
              soldOutItemIds: reason === "item_unavailable" ? soldOut : [],
            });
          }}
        >
          {t("rejectSubmit")}
        </button>
      </fieldset>
    </details>
  );
}

function CancelOrder({ disabled, send }: Controls) {
  const t = useTranslations("merchantBoard");
  const [reason, setReason] = useState("");
  function confirm(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && reason.trim()) send({ kind: "cancel", reason: reason.trim() });
  }

  return (
    <details className="board-disclosure">
      <summary>{t("cancel")}</summary>
      <form className="board-form" onSubmit={confirm}>
        <label className="board-form">
          <span>{t("reason")}</span>
          <textarea
            rows={2}
            maxLength={500}
            value={reason}
            disabled={disabled}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </label>
        <button className="board-danger" type="submit" disabled={disabled || !reason.trim()}>
          {t("cancelSubmit")}
        </button>
      </form>
    </details>
  );
}

function BoardActionControls({
  ticket,
  locale,
  ...controls
}: Controls & { ticket: Ticket; locale: Locale }) {
  const t = useTranslations("merchantBoard");
  if (ticket.status === "pending_acceptance") {
    return (
      <>
        <AcceptOrder {...controls} />
        <RejectOrder {...controls} ticket={ticket} locale={locale} />
      </>
    );
  }

  const preparing = ticket.status === "accepted";
  return (
    <>
      {preparing || ticket.fulfilment === "pickup" ? (
        <button
          className="board-primary"
          type="button"
          disabled={controls.disabled}
          onClick={() => {
            controls.send({ kind: preparing ? "ready" : "collect" });
          }}
        >
          {t(preparing ? "markReady" : "collect")}
        </button>
      ) : (
        <p className="board-waiting">{t("awaitingCourier")}</p>
      )}
      <CancelOrder {...controls} />
    </>
  );
}

export function BoardActions({
  ticket,
  locale,
  disabled,
  refresh,
}: {
  ticket: Ticket;
  locale: Locale;
  disabled: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("merchantBoard");
  const [result, setResult] = useState<"idle" | "sending" | "saved" | "conflict" | "error">("idle");
  const running = useRef(false);
  const retry = useRef<{ body: string; key: string } | null>(null);

  async function send(action: BoardAction) {
    if (running.current || disabled || result === "saved") return;
    running.current = true;
    setResult("sending");
    const body = JSON.stringify(action);
    const key = retry.current?.body === body ? retry.current.key : crypto.randomUUID();
    const response = await submitBoardAction({
      orderId: ticket.orderId,
      expectedVersion: ticket.version,
      key,
      action,
    });
    retry.current = response === "retry" ? { body, key } : null;
    running.current = false;
    setResult(response === "retry" ? "error" : response);
    refresh();
  }

  return (
    <div className="board-actions">
      <BoardActionControls
        ticket={ticket}
        locale={locale}
        disabled={disabled || result === "sending" || result === "saved"}
        send={(action) => void send(action)}
      />
      {result === "sending" && <p role="status">{t("sending")}</p>}
      {result === "conflict" && <p role="status">{t("conflict")}</p>}
      {result === "error" && (
        <p role="alert" className="board-error">
          {t("actionError")}
        </p>
      )}
    </div>
  );
}
