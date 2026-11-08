"use client";

import {
  ActionBar,
  Badge,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorState,
  FormGrid,
  MoneyField,
  PageHeader,
  Skeleton,
  TextAreaField,
  TextField,
  Toggle,
  useToast,
} from "@zaafran/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AuditEntity, GlobalFlag, PlatformSnapshot } from "./platform-http";
import { usePlatform, type PlatformState } from "./use-platform";

const flags: readonly GlobalFlag[] = ["ramadan_mode", "online_payments", "menu_photo_import"];
const entities = [
  "all",
  "flag",
  "setting",
  "invoice",
  "merchant",
  "item",
  "user",
  "order",
  "support",
] as const;
type EntityFilter = (typeof entities)[number];
const secondsUnit = "s";

function readText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

/** A kill switch: flipping it asks for the reason before anything is sent. */
function FlagRow({
  flag,
  isEnabled,
  state,
}: {
  flag: GlobalFlag;
  isEnabled: boolean;
  state: PlatformState;
}) {
  const translate = useTranslations("adminPlatform");
  const [pending, setPending] = useState<boolean>();
  return (
    <div className="platform-flag">
      <Toggle
        label={translate(`flag_${flag}`)}
        description={translate(`flag_${flag}_hint`)}
        checked={pending ?? isEnabled}
        disabled={state.isSaving}
        onChange={(checked) => {
          setPending(checked === isEnabled ? undefined : checked);
        }}
      />
      {pending !== undefined && (
        <form
          className="billing-reason"
          onSubmit={(event) => {
            event.preventDefault();
            void state
              .setFlag(flag, pending, readText(event.currentTarget, "reason"))
              .then((isSaved) => {
                if (isSaved) setPending(undefined);
              });
          }}
        >
          <TextField label={translate("reason")} name="reason" required maxLength={500} autoFocus />
          <div className="billing-reason-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPending(undefined);
              }}
            >
              {translate("cancel")}
            </Button>
            <Button
              type="submit"
              variant={pending ? "primary" : "destructive"}
              size="sm"
              isLoading={state.isSaving}
            >
              {translate(pending ? "turnOn" : "turnOff")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Operations({ snapshot, state }: { snapshot: PlatformSnapshot; state: PlatformState }) {
  const translate = useTranslations("adminPlatform");
  const { settings } = snapshot;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const reason = readText(form, "reason");
        const cap = Number(readText(form, "cap"));
        const timeout = Number(readText(form, "timeout"));
        void (async () => {
          if (cap !== settings.first_order_cash_cap_dzd)
            await state.setSetting("first_order_cash_cap_dzd", cap, reason);
          if (timeout !== settings.order_accept_timeout_seconds)
            await state.setSetting("order_accept_timeout_seconds", timeout, reason);
        })();
      }}
    >
      <Card title={translate("operations")} titleId="platform-operations">
        <FormGrid>
          <MoneyField
            label={translate("cashCap")}
            hint={translate("cashCapHint")}
            name="cap"
            unit={translate("unit")}
            defaultValue={String(settings.first_order_cash_cap_dzd)}
            required
          />
          <TextField
            label={translate("acceptTimeout")}
            hint={translate("acceptTimeoutHint")}
            name="timeout"
            width="short"
            suffix={secondsUnit}
            inputMode="numeric"
            dir="ltr"
            defaultValue={String(settings.order_accept_timeout_seconds)}
            required
          />
          <TextField label={translate("reason")} name="reason" required maxLength={500} />
        </FormGrid>
        <ActionBar>
          <Button type="submit" variant="primary" isLoading={state.isSaving}>
            {translate("save")}
          </Button>
        </ActionBar>
      </Card>
    </form>
  );
}

function MaintenanceBanner({
  snapshot,
  state,
}: {
  snapshot: PlatformSnapshot;
  state: PlatformState;
}) {
  const translate = useTranslations("adminPlatform");
  const banner = snapshot.settings.maintenance_banner;
  const [isShown, setIsShown] = useState(banner !== null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const value = isShown
          ? { ar: readText(form, "ar"), fr: readText(form, "fr"), en: readText(form, "en") }
          : null;
        void state.setSetting("maintenance_banner", value, readText(form, "reason"));
      }}
    >
      <Card title={translate("banner")} titleId="platform-banner">
        <Toggle
          label={translate("bannerShow")}
          description={translate("bannerHint")}
          checked={isShown}
          onChange={setIsShown}
        />
        {isShown && (
          <FormGrid>
            <TextAreaField
              label={translate("bannerAr")}
              name="ar"
              dir="rtl"
              lang="ar"
              required
              maxLength={300}
              defaultValue={banner?.ar ?? ""}
            />
            <TextAreaField
              label={translate("bannerFr")}
              name="fr"
              lang="fr"
              required
              maxLength={300}
              defaultValue={banner?.fr ?? ""}
            />
            <TextAreaField
              label={translate("bannerEn")}
              name="en"
              lang="en"
              required
              maxLength={300}
              defaultValue={banner?.en ?? ""}
            />
          </FormGrid>
        )}
        <TextField label={translate("reason")} name="reason" required maxLength={500} />
        <ActionBar>
          <Button type="submit" variant="primary" isLoading={state.isSaving}>
            {translate("save")}
          </Button>
        </ActionBar>
      </Card>
    </form>
  );
}

function AuditLog({ state }: { state: PlatformState }) {
  const translate = useTranslations("adminPlatform");
  const format = useFormatter();
  const { audit } = state;
  const options = entities.map((value) => ({ value, label: translate(`entity_${value}`) }));
  const current: EntityFilter = state.entity ?? "all";
  return (
    <Card title={translate("audit")} titleId="platform-audit">
      <ChipGroup
        legend={translate("auditFilter")}
        options={options}
        value={current}
        onChange={(value) => {
          state.filterAudit(value === "all" ? undefined : (value satisfies AuditEntity));
        }}
      />
      {audit.kind === "loading" && <Skeleton label={translate("loading")} lines={4} />}
      {audit.kind === "ready" && audit.events.length === 0 && (
        <EmptyState icon="receipt" title={translate("auditEmpty")} />
      )}
      {audit.kind === "ready" && audit.events.length > 0 && (
        <ul className="billing-rows">
          {audit.events.map((event) => (
            <li key={event.id} className="billing-row">
              <div className="billing-row-main">
                <p className="billing-row-title">
                  <Badge tone="neutral">{translate(`entity_${event.entity}`)}</Badge>
                  <bdi dir="ltr" className="billing-id">
                    {event.action}
                  </bdi>
                </p>
                <p className="billing-row-meta">
                  <bdi dir="ltr">{event.entityId}</bdi>
                  <span>{event.reason}</span>
                </p>
              </div>
              <time className="review-card-date" dateTime={event.createdAt}>
                {format.dateTime(new Date(event.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Algiers",
                })}
              </time>
            </li>
          ))}
        </ul>
      )}
      {audit.kind === "error" && (
        <ErrorState
          title={translate("loadError")}
          retryLabel={translate("retry")}
          onRetry={state.refresh}
        />
      )}
    </Card>
  );
}

const noticeKeys = {
  saved: "saved",
  invalid: "invalid",
  "session-changed": "sessionChanged",
  "sign-in": "signInRequired",
  error: "saveError",
} as const;

function useNoticeToast(state: PlatformState) {
  const translate = useTranslations("adminPlatform");
  const toast = useToast();
  const { notice } = state;
  useEffect(() => {
    if (notice !== undefined)
      toast.show(
        translate(noticeKeys[notice.result]),
        notice.result === "saved" ? "success" : "danger",
      );
  }, [notice, toast, translate]);
}

/** ADM-08 / ADM-09 view (page and design gallery). */
export function PlatformConsoleView({ state }: { state: PlatformState }) {
  const translate = useTranslations("adminPlatform");
  useNoticeToast(state);
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="platform-title">
      <PageHeader title={translate("title")} intro={translate("intro")} titleId="platform-title" />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={8} />}
      {view.kind === "sign-in" && <ErrorState title={translate("signInRequired")} />}
      {view.kind === "error" && (
        <ErrorState
          title={translate("loadError")}
          retryLabel={translate("retry")}
          onRetry={state.refresh}
        />
      )}
      {view.kind === "ready" && (
        <div className="billing-two-columns">
          <div className="billing-layout">
            <Card title={translate("flags")} titleId="platform-flags">
              {flags.map((flag) => (
                <FlagRow key={flag} flag={flag} isEnabled={view.flags[flag]} state={state} />
              ))}
            </Card>
            <Operations snapshot={view} state={state} />
            <MaintenanceBanner snapshot={view} state={state} />
          </div>
          <AuditLog state={state} />
        </div>
      )}
    </section>
  );
}

/** ADM-08 / ADM-09: kill switches, operations settings, maintenance banner and audit log. */
export function PlatformConsole() {
  return <PlatformConsoleView state={usePlatform()} />;
}
