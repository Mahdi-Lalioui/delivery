"use client";

import { ActionBar, Button, Card, EmptyState, Icon, PageHeader, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { usePrivacy, type PrivacyState } from "./use-privacy";

const errorKeys = {
  "invalid-code": "invalidCode",
  expired: "codeExpired",
  "send-error": "sendError",
  "sign-in": "signInRequired",
  "rate-limited": "rateLimited",
  unknown: "deleteUnknown",
  error: "deleteError",
} as const;

function DeleteStep({ state }: { state: PrivacyState }) {
  const translate = useTranslations("retentionPrivacy");
  const error =
    state.deleteError === undefined ? undefined : translate(errorKeys[state.deleteError]);
  if (state.step.kind !== "code-sent") {
    return (
      <>
        {error !== undefined && (
          <p className="ui-field-error" role="alert">
            {error}
          </p>
        )}
        <ActionBar>
          <Button
            variant="destructive"
            icon="alert"
            isLoading={state.isBusy}
            onClick={() => {
              void state.sendCode();
            }}
          >
            {translate("deleteStart")}
          </Button>
        </ActionBar>
      </>
    );
  }
  return (
    <form
      className="privacy-confirm"
      onSubmit={(event) => {
        event.preventDefault();
        const code = new FormData(event.currentTarget).get("code");
        void state.confirm(typeof code === "string" ? code : "");
      }}
    >
      <p>{translate("codeSent")}</p>
      <TextField
        label={translate("code")}
        name="code"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        width="short"
        dir="ltr"
        autoFocus
        error={error}
      />
      <ActionBar>
        <Button variant="ghost" onClick={state.cancel}>
          {translate("cancel")}
        </Button>
        <Button type="submit" variant="destructive" isLoading={state.isBusy}>
          {translate("deleteConfirm")}
        </Button>
      </ActionBar>
    </form>
  );
}

/** CUS-24 privacy view (page and design gallery). */
export function PrivacyView({ state, homeHref }: { state: PrivacyState; homeHref: string }) {
  const translate = useTranslations("retentionPrivacy");
  if (state.step.kind === "deleted") {
    return (
      <section className="rating-page" aria-label={translate("deletedTitle")}>
        <EmptyState
          icon="check"
          title={translate("deletedTitle")}
          body={translate("deletedBody")}
          action={
            <a className="ui-button ui-button-primary ui-button-md" href={homeHref}>
              <span>{translate("home")}</span>
            </a>
          }
        />
      </section>
    );
  }
  return (
    <section className="billing-page privacy-page" aria-labelledby="privacy-title">
      <PageHeader title={translate("title")} intro={translate("intro")} titleId="privacy-title" />
      <Card title={translate("exportTitle")} titleId="privacy-export">
        <p>{translate("exportBody")}</p>
        {state.exportStatus === "error" && (
          <p className="ui-field-error" role="alert">
            {translate("exportError")}
          </p>
        )}
        {state.exportStatus === "ready" && (
          <p className="billing-row-meta" role="status">
            <Icon name="check" size={16} />
            {translate("exportReady")}
          </p>
        )}
        <ActionBar>
          <Button
            variant="secondary"
            icon="download"
            isLoading={state.isBusy && state.step.kind === "idle"}
            onClick={() => {
              void state.downloadExport();
            }}
          >
            {translate("exportButton")}
          </Button>
        </ActionBar>
      </Card>
      <section className="privacy-danger" aria-labelledby="privacy-delete">
        <h2 id="privacy-delete" className="ui-card-title">
          {translate("deleteTitle")}
        </h2>
        <ul id="privacy-consequences" className="privacy-consequences">
          <li>{translate("consequenceProfile")}</li>
          <li>{translate("consequenceOrders")}</li>
          <li>{translate("consequenceUndo")}</li>
        </ul>
        <DeleteStep state={state} />
      </section>
    </section>
  );
}

export function PrivacyScreen({ homeHref, fileName }: { homeHref: string; fileName: string }) {
  return <PrivacyView state={usePrivacy(fileName)} homeHref={homeHref} />;
}
