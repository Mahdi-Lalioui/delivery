"use client";

import { courierInviteAcceptInput } from "@zaafran/contracts/courier";
import type { Locale } from "@zaafran/i18n/locales";
import { Button, ButtonLink, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import {
  clearInvitationFragment,
  readPendingInvitation,
  stageInvitation,
} from "../auth/invitation-continuations";
import { acceptCourierInvite } from "./courier-http";

type InviteView = { kind: "loading" | "absent" | "error" } | { kind: "ready"; inviteId?: string };
const acceptDetails = courierInviteAcceptInput.pick({ displayName: true });

async function openCourierInvite(): Promise<InviteView> {
  const fragment = window.location.hash;
  const params = new URLSearchParams(fragment.slice(1));
  const input = courierInviteAcceptInput.shape.inviteId.safeParse(params.get("invite"));
  try {
    if (input.success) {
      const inviteId = input.data;
      if (!(await stageInvitation("courier", inviteId))) return { kind: "error" };
      clearInvitationFragment(fragment);
      return { kind: "ready", inviteId };
    }
    if (params.has("invite")) clearInvitationFragment(fragment);
    const pending = await readPendingInvitation("courier");
    return pending ? { kind: "ready" } : { kind: "absent" };
  } catch {
    return { kind: "error" };
  }
}

export function useCourierInvite() {
  const [invite, setInvite] = useState<InviteView>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const request = useRef<{ attempt: number; result: Promise<InviteView> } | undefined>(undefined);
  useEffect(() => {
    if (request.current?.attempt !== attempt) {
      request.current = { attempt, result: openCourierInvite() };
    }
    let isCurrent = true;
    void request.current.result.then((result) => {
      if (isCurrent) setInvite(result);
    });
    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  return {
    invite,
    dismiss: () => {
      setInvite({ kind: "absent" });
    },
    retry: () => {
      setInvite({ kind: "loading" });
      setAttempt((current) => current + 1);
    },
  };
}

export function CourierInvite({
  inviteId,
  locale,
  onAccepted,
}: {
  inviteId?: string | undefined;
  locale: Locale;
  onAccepted: () => void;
}) {
  const t = useTranslations("courier");
  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "sign-in" | "expired" | "error">("idle");

  async function accept(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    const input = acceptDetails.safeParse(name ? { displayName: name } : {});
    if (!input.success || state === "saving") return;
    setState("saving");
    const result = await acceptCourierInvite({
      ...input.data,
      ...(inviteId === undefined ? {} : { inviteId }),
    });
    if (result.kind === "ready") {
      onAccepted();
      return;
    }
    if (result.kind === "sign-in") {
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
