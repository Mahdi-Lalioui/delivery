"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { formatAlgerianPhone } from "@zaafran/i18n/phone";
import { Badge, Button, ButtonLink, ErrorState, Skeleton } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readSignInMethods, type SignInMethod } from "../auth/auth-http";
import { readIdentifiers, type IdentifierRead } from "../auth/identifier-http";
import { IdentifierEditor } from "./identifier-editor";

const channels = ["phone", "email"] as const;
type Status = { profile: IdentifierRead; methods: SignInMethod[] | undefined };

export function IdentifierPanel({ locale }: { locale: Locale }) {
  const t = useTranslations("accountHub");
  const [status, setStatus] = useState<Status>();
  const [editing, setEditing] = useState<SignInMethod>();
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readIdentifiers(controller.signal),
      readSignInMethods(controller.signal),
    ]).then(([profile, methods]) => {
      if (!controller.signal.aborted) setStatus({ profile, methods });
    });
    return () => {
      controller.abort();
    };
  }, [revision]);
  if (!status) return <Skeleton label={t("contactLoading")} lines={2} />;
  if (status.profile.kind === "sign-in")
    return (
      <ButtonLink variant="primary" href={`/${locale}/sign-in`}>
        {t("signIn")}
      </ButtonLink>
    );
  if (status.profile.kind !== "ready" || !status.methods)
    return (
      <ErrorState
        title={t("contactError")}
        retryLabel={t("contactRetry")}
        onRetry={() => {
          setStatus(undefined);
          setRevision((value) => value + 1);
        }}
      />
    );
  return (
    <IdentifierDetails
      locale={locale}
      profile={status.profile.value}
      methods={status.methods}
      editing={editing}
      saved={saved}
      onEdit={setEditing}
      onSave={(value) => {
        setStatus({ ...status, profile: { kind: "ready", value } });
        setEditing(undefined);
        setSaved(true);
      }}
    />
  );
}

type Details = {
  locale: Locale;
  profile: Extract<IdentifierRead, { kind: "ready" }>["value"];
  methods: SignInMethod[];
  editing: SignInMethod | undefined;
  saved: boolean;
  onEdit: (method: SignInMethod | undefined) => void;
  onSave: (profile: Details["profile"]) => void;
};

function IdentifierDetails({ locale, profile, methods, editing, saved, onEdit, onSave }: Details) {
  const t = useTranslations("accountHub");
  const auth = useTranslations("auth");
  return (
    <section className="account-identifiers" aria-labelledby="account-identifiers-title">
      <div>
        <h2 id="account-identifiers-title">{t("contactTitle")}</h2>
        <p>{t("contactIntro")}</p>
      </div>
      <ul className="account-identifier-list" role="list">
        {channels.map((method) => {
          const value = profile[method];
          const display =
            method === "phone" && value ? (formatAlgerianPhone(value) ?? value) : value;
          return (
            <li key={method} className="account-identifier-row">
              <div className="account-identifier-value">
                <div className="account-identifier-label">
                  <strong>{auth(method === "phone" ? "phoneLabel" : "emailLabel")}</strong>
                  {value && <Badge tone="success">{t("contactVerified")}</Badge>}
                </div>
                <p>{display ? <bdi dir="ltr">{display}</bdi> : t("contactEmpty")}</p>
              </div>
              {methods.includes(method) && editing === undefined && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onEdit(method);
                  }}
                >
                  {t(value ? "contactChange" : "contactAdd")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <IdentifierEditor
          key={editing}
          method={editing}
          locale={locale}
          sessionId={profile.sessionId}
          onSave={onSave}
          onClose={() => {
            onEdit(undefined);
          }}
        />
      )}
      {saved && !editing && <p role="status">{t("contactSaved")}</p>}
    </section>
  );
}
