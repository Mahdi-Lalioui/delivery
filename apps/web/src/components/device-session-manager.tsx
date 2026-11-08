"use client";

import { formatAlgiersDate, formatAlgiersTime } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import type { DeviceSession } from "../auth/device-sessions-http";
import { useDeviceSessions, type DeviceSessions } from "../auth/use-device-sessions";

interface DeviceTimestampProps {
  value: string;
  locale: Locale;
}

function DeviceTimestamp({ value, locale }: DeviceTimestampProps) {
  const translate = useTranslations("sessions");
  const instant = Date.parse(value);

  return (
    <time dateTime={value}>
      {translate("dateTime", {
        date: formatAlgiersDate(instant, locale),
        time: `\u2066${formatAlgiersTime(instant, locale)}\u2069`,
      })}
    </time>
  );
}

interface DeviceRowProps {
  device: DeviceSession;
  locale: Locale;
  pending: boolean;
  onRevoke: (id: string) => Promise<void>;
}

function DeviceRow({ device, locale, pending, onRevoke }: DeviceRowProps) {
  const translate = useTranslations("sessions");
  const name = device.deviceName ?? translate("unknownDevice");
  const nameId = "session-name-" + device.id;
  const revokeId = "session-revoke-" + device.id;

  return (
    <li className="session-row">
      <div className="session-row-heading">
        <h2 id={nameId}>
          <bdi>{name}</bdi>
        </h2>
        {device.current && <span className="session-badge">{translate("currentDevice")}</span>}
      </div>
      <dl className="session-details">
        <div>
          <dt>{translate("lastSeen")}</dt>
          <dd>
            <DeviceTimestamp value={device.lastSeenAt} locale={locale} />
          </dd>
        </div>
        <div>
          <dt>{translate("expires")}</dt>
          <dd>
            <DeviceTimestamp value={device.expiresAt} locale={locale} />
          </dd>
        </div>
      </dl>
      {!device.current && (
        <button
          type="button"
          className="session-revoke"
          aria-labelledby={revokeId + " " + nameId}
          disabled={pending}
          onClick={() => void onRevoke(device.id)}
        >
          <span id={revokeId}>{translate("revoke")}</span>
        </button>
      )}
    </li>
  );
}

interface DeviceSessionContentProps {
  controls: DeviceSessions;
  locale: Locale;
  restoreFocus: () => void;
}

function DeviceSessionContent({ controls, locale, restoreFocus }: DeviceSessionContentProps) {
  const translate = useTranslations("sessions");
  const { view, pending } = controls;

  switch (view.kind) {
    case "loading":
      return <p role="status">{translate("loading")}</p>;
    case "load-error":
      return (
        <>
          <p className="session-error" role="alert">
            {translate("loadError")}
          </p>
          <button
            type="button"
            className="session-action"
            onClick={() => {
              controls.retry();
              restoreFocus();
            }}
          >
            {translate("retry")}
          </button>
        </>
      );
    case "unauthenticated":
    case "signed-out":
      return (
        <>
          <p role="status">
            {translate(view.kind === "signed-out" ? "signedOut" : "unauthenticated")}
          </p>
          <a className="session-action" href={`/${locale}/sign-in`}>
            {translate("signIn")}
          </a>
        </>
      );
    case "ready":
      return (
        <>
          {view.sessions.length === 0 ? (
            <p>{translate("empty")}</p>
          ) : (
            <ul className="session-list" role="list">
              {view.sessions.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  locale={locale}
                  pending={pending}
                  onRevoke={async (id) => {
                    await controls.revoke(id);
                    restoreFocus();
                  }}
                />
              ))}
            </ul>
          )}
          <div className="session-actions">
            {(["current", "all"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                className="session-action"
                disabled={pending}
                onClick={() => {
                  void controls.signOut(scope).then(restoreFocus);
                }}
              >
                {translate(scope === "all" ? "signOutAll" : "signOutCurrent")}
              </button>
            ))}
          </div>
        </>
      );
  }
}

export function DeviceSessionManager({ locale }: { locale: Locale }) {
  const translate = useTranslations("sessions");
  const controls = useDeviceSessions();
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <section className="session-panel" aria-labelledby="session-title">
      <header className="session-heading">
        <h1 id="session-title" tabIndex={-1} ref={titleRef}>
          {translate("title")}
        </h1>
        <p>{translate("description")}</p>
      </header>
      <DeviceSessionContent
        controls={controls}
        locale={locale}
        restoreFocus={() => {
          titleRef.current?.focus();
        }}
      />
      {controls.pending && <p role="status">{translate("working")}</p>}
      {controls.status === "revoked" && <p role="status">{translate("revoked")}</p>}
      {controls.status === "action-error" && (
        <p className="session-error" role="alert">
          {translate("actionError")}
        </p>
      )}
    </section>
  );
}
