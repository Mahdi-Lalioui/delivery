"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { Badge, Button, Icon, Skeleton, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState, type SubmitEvent } from "react";
import { listMerchantMemberships } from "../merchant/merchant-http";
import { inviteCourier, readCourierRoster, type CourierRoster, type Ticket } from "./board-http";

function useRoster(merchantId: string, open: boolean) {
  const [roster, setRoster] = useState<CourierRoster | null | undefined>(undefined);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void readCourierRoster(merchantId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setRoster(value ?? null);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, open, revision]);
  return {
    roster,
    retry: () => {
      setRoster(undefined);
      setRevision((value) => value + 1);
    },
  };
}

function useOwner(merchantId: string, open: boolean) {
  const [owner, setOwner] = useState<boolean | undefined>();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void listMerchantMemberships(controller.signal).then((result) => {
      if (!controller.signal.aborted)
        setOwner(
          result.kind === "ready" &&
            result.data.memberships.some(
              (member) => member.merchantId === merchantId && member.role === "owner",
            ),
        );
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, open]);
  return owner;
}

function RosterList({
  roster,
  selected,
  disabled,
  onSelect,
}: {
  roster: CourierRoster;
  selected?: string | null;
  disabled?: boolean;
  onSelect?: (id: string) => void;
}) {
  const t = useTranslations("merchantBoard");
  if (!roster.length) return <p className="board-waiting">{t("noCouriers")}</p>;
  return (
    <ul className="board-roster">
      {roster.map(({ courierId, displayName, online }) => (
        <li key={courierId}>
          {onSelect ? (
            <Button
              variant={courierId === selected ? "primary" : "secondary"}
              disabled={disabled || courierId === selected}
              onClick={() => {
                onSelect(courierId);
              }}
            >
              <bdi>{displayName ?? t("unnamedCourier")}</bdi>
            </Button>
          ) : (
            <strong>
              <bdi>{displayName ?? t("unnamedCourier")}</bdi>
            </strong>
          )}
          <Badge tone={online ? "success" : "neutral"}>
            {t(online ? "courierOnline" : "courierOffline")}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function RosterContent({
  state,
  children,
}: {
  state: ReturnType<typeof useRoster>;
  children: (roster: CourierRoster) => React.ReactNode;
}) {
  const t = useTranslations("merchantBoard");
  if (state.roster === undefined) return <Skeleton label={t("loading")} lines={2} />;
  if (state.roster === null)
    return (
      <div className="board-form">
        <p role="alert" className="board-error">
          {t("courierLoadError")}
        </p>
        <Button variant="secondary" onClick={state.retry}>
          {t("retry")}
        </Button>
      </div>
    );
  return children(state.roster);
}

export function BoardAssignCourier({
  ticket,
  disabled,
  select,
}: {
  ticket: Ticket;
  disabled: boolean;
  select: (courierId: string) => void;
}) {
  const t = useTranslations("merchantBoard");
  const [open, setOpen] = useState(false);
  const state = useRoster(ticket.merchantId, open);
  return (
    <details
      className="board-disclosure"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{t(ticket.courierId ? "changeCourier" : "assignCourier")}</summary>
      {open && (
        <RosterContent state={state}>
          {(roster) => (
            <RosterList
              roster={roster}
              selected={ticket.courierId ?? null}
              disabled={disabled}
              onSelect={select}
            />
          )}
        </RosterContent>
      )}
    </details>
  );
}

function CourierInviteForm({
  merchantId,
  locale,
  offline,
}: {
  merchantId: string;
  locale: Locale;
  offline: boolean;
}) {
  const t = useTranslations("merchantBoard");
  const [phone, setPhone] = useState("");
  const [link, setLink] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "already" | "error" | "copied">("idle");
  const normalized = normalizeAlgerianPhone(phone);

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized || offline || state === "sending") return;
    setState("sending");
    setLink("");
    const result = await inviteCourier(merchantId, normalized);
    if (result.kind !== "ready") {
      setState(result.kind);
      return;
    }
    const destination = new URL(`/${locale}/courier`, window.location.origin);
    destination.hash = new URLSearchParams({ invite: result.data.inviteId }).toString();
    setLink(destination.toString());
    setState("idle");
  }

  async function copy() {
    if (!("clipboard" in navigator)) return;
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      // The link remains selectable when the browser disallows clipboard writes.
    }
  }

  return (
    <form className="board-form board-invite-form" onSubmit={(event) => void create(event)}>
      <TextField
        label={t("courierPhone")}
        inputMode="tel"
        autoComplete="tel"
        name="courierPhone"
        dir="ltr"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
        }}
      />
      <Button
        variant="primary"
        type="submit"
        isLoading={state === "sending"}
        disabled={offline || !normalized}
      >
        {t("createCourierInvite")}
      </Button>
      {(state === "error" || state === "already") && (
        <p role="alert" className="board-error">
          {t(state === "already" ? "courierAlready" : "courierInviteError")}
        </p>
      )}
      {link && (
        <div className="board-form">
          <TextField
            label={t("courierInviteLink")}
            name="courierInviteLink"
            readOnly
            value={link}
            dir="ltr"
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <Button variant="secondary" icon="copy" onClick={() => void copy()}>
            {t("copyCourierInvite")}
          </Button>
          {state === "copied" && <p role="status">{t("courierInviteCopied")}</p>}
        </div>
      )}
    </form>
  );
}

export function BoardCourierTeam({
  merchantId,
  locale,
  offline,
}: {
  merchantId: string;
  locale: Locale;
  offline: boolean;
}) {
  const t = useTranslations("merchantBoard");
  const [open, setOpen] = useState(false);
  const owner = useOwner(merchantId, open);
  const state = useRoster(merchantId, open);
  return (
    <details
      className="board-auxiliary"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span>
          <Icon name="bike" />
          {t("courierTeam")}
        </span>
        <Icon name="chevron" />
      </summary>
      {open && (
        <div className="board-auxiliary-content">
          <RosterContent state={state}>{(roster) => <RosterList roster={roster} />}</RosterContent>
          {owner && <CourierInviteForm merchantId={merchantId} locale={locale} offline={offline} />}
        </div>
      )}
    </details>
  );
}
