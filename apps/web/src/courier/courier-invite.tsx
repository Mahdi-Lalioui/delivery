"use client";

import { courierInviteAcceptInput } from "@zaafran/contracts/courier";
import type { Locale } from "@zaafran/i18n/locales";
import { Button, ButtonLink, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState, type SubmitEvent } from "react";
import { acceptCourierInvite } from "./courier-http";

const storageKey = "zaafran.courierInvite";

function parseInvite(inviteId: string | null) {
  const input = courierInviteAcceptInput.safeParse({ inviteId });
  return input.success ? input.data.inviteId : undefined;
}

function rememberInvite(inviteId?: string) {
  try {
    if (inviteId) sessionStorage.setItem(storageKey, inviteId);
    else sessionStorage.removeItem(storageKey);
  } catch {
    // The invite can be reopened after sign-in if session storage is unavailable.
  }
}

export function useCourierInvite() {
  const [invite, setInvite] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const fromLink = parseInvite(params.get("invite"));
    if (fromLink) rememberInvite(fromLink);
    if (params.has("invite"))
      history.replaceState(history.state, "", window.location.pathname + window.location.search);
    let remembered: string | undefined;
    try {
      remembered = parseInvite(sessionStorage.getItem(storageKey));
    } catch {
      remembered = undefined;
    }
    setInvite(fromLink ?? remembered ?? null);
  }, []);

  return {
    invite,
    dismiss: () => {
      rememberInvite();
      setInvite(null);
    },
  };
}

export function CourierInvite({
  inviteId,
  locale,
  onAccepted,
}: {
  inviteId: string;
  locale: Locale;
  onAccepted: () => void;
}) {
  const t = useTranslations("courier");
  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "sign-in" | "expired" | "error">("idle");

  async function accept(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    const input = courierInviteAcceptInput.safeParse({
      inviteId,
      ...(name ? { displayName: name } : {}),
    });
    if (!input.success || state === "saving") return;
    setState("saving");
    const result = await acceptCourierInvite(input.data);
    if (result.kind === "ready") {
      onAccepted();
      return;
    }
    if (result.kind === "sign-in") {
      rememberInvite(inviteId);
      setState("sign-in");
      return;
    }
    setState(result.kind === "forbidden" || result.kind === "conflict" ? "expired" : "error");
  }

  return (
    <section className="courier-panel courier-invite" aria-labelledby="courier-invite-title">
      <h2 id="courier-invite-title">{t("inviteTitle")}</h2>
      <p>{t("inviteBody")}</p>
      {state === "sign-in" ? (
        <ButtonLink variant="primary" href={`/${locale}/sign-in?continue=courier`}>
          {t("signIn")}
        </ButtonLink>
      ) : (
        <form onSubmit={(event) => void accept(event)}>
          <TextField
            label={t("firstName")}
            name="courierName"
            autoComplete="given-name"
            maxLength={80}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
          />
          {(state === "expired" || state === "error") && (
            <p className="courier-error" role="alert">
              {t(state === "expired" ? "inviteInvalid" : "error")}
            </p>
          )}
          <Button variant="primary" isLoading={state === "saving"} type="submit">
            {t("acceptInvite")}
          </Button>
        </form>
      )}
    </section>
  );
}
