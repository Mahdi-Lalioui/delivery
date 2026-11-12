"use client";

import { merchantDeliverySettingsInput } from "@zaafran/contracts/merchant-delivery";
import {
  ActionBar,
  Button,
  Card,
  FormGrid,
  MoneyField,
  TextField,
  Toggle,
  useToast,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { saveDeliverySettings, type DeliverySnapshot } from "./delivery-http";

type Zone = NonNullable<DeliverySnapshot["settings"]["zone"]>;
type Status = "idle" | "pending" | "stale" | "error" | "invalid";
const defaultZone: Zone = { radiusMeters: 3000, feeDzd: 0, minimumDzd: 0, travelMinutes: 15 };

function numeric(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? Number(value) : undefined;
}

function draft(form: FormData, snapshot: DeliverySnapshot) {
  const deliveryEnabled = form.has("delivery");
  const kilometers = numeric(form, "radius");
  return merchantDeliverySettingsInput.safeParse({
    expectedRevision: snapshot.revision,
    pickupEnabled: form.has("pickup"),
    deliveryEnabled,
    pickupMinimumDzd: numeric(form, "pickupMinimum"),
    prepMinutes: numeric(form, "prep"),
    zone: deliveryEnabled
      ? {
          radiusMeters: kilometers === undefined ? undefined : Math.round(kilometers * 1000),
          feeDzd: numeric(form, "fee"),
          minimumDzd: numeric(form, "minimum"),
          travelMinutes: numeric(form, "travel"),
        }
      : snapshot.settings.zone,
  });
}

function DeliveryZone({ zone, enabled }: { zone: Zone; enabled: boolean }) {
  const t = useTranslations("merchantDelivery");
  return (
    <fieldset className="delivery-zone" aria-labelledby="delivery-coverage" disabled={!enabled}>
      <p>{t(enabled ? "coverageHint" : "coverageDisabledHint")}</p>
      <FormGrid>
        <TextField
          label={t("radius")}
          name="radius"
          type="number"
          inputMode="decimal"
          dir="ltr"
          width="short"
          suffix={t("kilometers")}
          min={0.1}
          max={100}
          step={0.001}
          defaultValue={zone.radiusMeters / 1000}
          required
        />
        <MoneyField
          label={t("fee")}
          name="fee"
          unit={t("dzd")}
          type="number"
          min={0}
          max={2_147_483_647}
          defaultValue={zone.feeDzd}
          required
        />
        <MoneyField
          label={t("minimum")}
          name="minimum"
          unit={t("dzd")}
          type="number"
          min={0}
          max={2_147_483_647}
          defaultValue={zone.minimumDzd}
          required
        />
        <TextField
          label={t("travel")}
          name="travel"
          type="number"
          inputMode="numeric"
          dir="ltr"
          width="short"
          suffix={t("minutes")}
          min={1}
          max={120}
          defaultValue={zone.travelMinutes}
          required
        />
      </FormGrid>
    </fieldset>
  );
}

function SaveStatus({ status, onReload }: { status: Status; onReload: () => void }) {
  const t = useTranslations("merchantDelivery");
  const reload = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status === "stale") reload.current?.querySelector("button")?.focus();
  }, [status]);
  if (status === "stale")
    return (
      <div className="delivery-alert" role="alert" ref={reload}>
        <p>{t("stale")}</p>
        <Button variant="secondary" onClick={onReload}>
          {t("reload")}
        </Button>
      </div>
    );
  if (status === "error" || status === "invalid")
    return (
      <p className="delivery-alert" role="alert">
        {t(status)}
      </p>
    );
  return null;
}

export function DeliveryForm({
  merchantId,
  initial,
  onReload,
}: {
  merchantId: string;
  initial: DeliverySnapshot;
  onReload: () => void;
}) {
  const t = useTranslations("merchantDelivery");
  const toast = useToast();
  const [snapshot, setSnapshot] = useState(initial);
  const [enabled, setEnabled] = useState(initial.settings.deliveryEnabled);
  const [status, setStatus] = useState<Status>("idle");
  const attempt = useRef<{ key: string; body: string }>(null);
  const busy = useRef(false);
  const blocked = status === "pending" || status === "stale";

  async function save(form: HTMLFormElement) {
    if (busy.current || blocked) return;
    const parsed = draft(new FormData(form), snapshot);
    if (!parsed.success) {
      setStatus("invalid");
      return;
    }
    const body = JSON.stringify(parsed.data);
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    busy.current = true;
    setStatus("pending");
    const result = await saveDeliverySettings({
      merchantId,
      sessionId: snapshot.sessionId,
      ...attempt.current,
    });
    busy.current = false;
    if (result.kind !== "saved") {
      setStatus(result.kind);
      return;
    }
    attempt.current = null;
    const { pickupEnabled, deliveryEnabled, pickupMinimumDzd, prepMinutes, zone } = parsed.data;
    setSnapshot({
      ...snapshot,
      revision: result.revision,
      settings: { pickupEnabled, deliveryEnabled, pickupMinimumDzd, prepMinutes, zone },
    });
    setStatus("idle");
    toast.show(t("saved"));
  }

  const { settings } = snapshot;
  return (
    <form
      aria-label={t("title")}
      className="delivery-form"
      aria-busy={status === "pending"}
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      <fieldset className="delivery-fields" disabled={blocked}>
        <Card title={t("modes")} titleId="delivery-modes">
          <div className="delivery-toggles">
            <Toggle
              name="delivery"
              label={t("delivery")}
              description={t("deliveryHint")}
              checked={enabled}
              onChange={setEnabled}
            />
            <Toggle
              name="pickup"
              label={t("pickup")}
              description={t("pickupHint")}
              defaultChecked={settings.pickupEnabled}
            />
          </div>
          <FormGrid>
            <MoneyField
              label={t("pickupMinimum")}
              name="pickupMinimum"
              unit={t("dzd")}
              type="number"
              min={0}
              max={2_147_483_647}
              defaultValue={settings.pickupMinimumDzd}
              required
            />
            <TextField
              label={t("prep")}
              name="prep"
              type="number"
              inputMode="numeric"
              dir="ltr"
              width="short"
              suffix={t("minutes")}
              min={5}
              max={120}
              defaultValue={settings.prepMinutes}
              required
            />
          </FormGrid>
        </Card>
        <Card title={t("coverage")} titleId="delivery-coverage">
          <DeliveryZone zone={settings.zone ?? defaultZone} enabled={enabled} />
        </Card>
      </fieldset>
      <SaveStatus status={status} onReload={onReload} />
      <ActionBar>
        <Button type="submit" variant="primary" disabled={blocked} isLoading={status === "pending"}>
          {t(status === "pending" ? "saving" : "save")}
        </Button>
      </ActionBar>
    </form>
  );
}
