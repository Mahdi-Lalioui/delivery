"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { formatAlgerianPhone } from "@zaafran/i18n/phone";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { OtpPurpose } from "../auth/auth-http";
import { usePhoneSignIn, type PhoneSignIn } from "../auth/use-phone-sign-in";

const errorId = "sign-in-error";
const titleId = "sign-in-title";
const codeDescriptionId = "sign-in-code-description";
const digitSlots = [0, 1, 2, 3, 4, 5];

type Translate = ReturnType<typeof useTranslations<"auth">>;
type InputRef = React.RefObject<HTMLInputElement | null>;

interface FieldProps {
  flow: PhoneSignIn;
  translate: Translate;
  inputRef: InputRef;
}

function PhoneField({ flow, translate, inputRef }: FieldProps) {
  return (
    <div className="auth-field">
      <label htmlFor="sign-in-phone">{translate("phoneLabel")}</label>
      <input
        id="sign-in-phone"
        ref={inputRef}
        type="tel"
        autoComplete="tel"
        dir="ltr"
        value={flow.phone}
        readOnly={flow.pending !== undefined}
        onChange={(event) => {
          flow.setPhone(event.currentTarget.value);
        }}
        aria-invalid={flow.error === "invalidPhone"}
        aria-describedby={flow.error ? `sign-in-phone-hint ${errorId}` : "sign-in-phone-hint"}
        className="auth-phone-input"
      />
      <p className="auth-hint" id="sign-in-phone-hint">
        {translate("phoneHint")}
      </p>
    </div>
  );
}

function CodeField({ flow, translate, inputRef }: FieldProps) {
  const [selection, setSelection] = useState(0);
  const isOtp = flow.step.kind === "otp";
  const hasInvalidCode =
    flow.error === "invalidCode" || flow.error === "otpInvalid" || flow.error === "totpInvalid";

  return (
    <div className="auth-field">
      <label htmlFor="sign-in-code">{translate(isOtp ? "otpLabel" : "totpLabel")}</label>
      <div className="auth-code" dir="ltr">
        <div className="auth-code-cells" aria-hidden="true">
          {digitSlots.map((index) => (
            <span
              className="auth-code-cell"
              key={index}
              data-current={index === Math.min(selection, 5) || undefined}
            >
              {flow.code[index]}
            </span>
          ))}
        </div>
        <input
          id="sign-in-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete={isOtp ? "one-time-code" : "off"}
          autoCapitalize="off"
          spellCheck={false}
          value={flow.code}
          readOnly={flow.pending !== undefined}
          disabled={!flow.canVerify}
          onChange={(event) => {
            setSelection(event.currentTarget.selectionStart ?? event.currentTarget.value.length);
            flow.setCode(event.currentTarget.value);
          }}
          onSelect={(event) => {
            setSelection(event.currentTarget.selectionStart ?? 0);
          }}
          aria-invalid={hasInvalidCode}
          aria-describedby={flow.error ? codeDescriptionId + " " + errorId : codeDescriptionId}
        />
      </div>
    </div>
  );
}

function StepHeading({
  flow,
  purpose,
  translate,
}: {
  flow: PhoneSignIn;
  purpose: OtpPurpose;
  translate: Translate;
}) {
  switch (flow.step.kind) {
    case "phone":
      return (
        <>
          <h1 id={titleId}>{translate(purpose === "admin_sign_in" ? "adminTitle" : "title")}</h1>
          <p>{translate("phoneDescription")}</p>
        </>
      );
    case "otp": {
      const number = formatAlgerianPhone(flow.step.phone) ?? flow.step.phone;
      return (
        <>
          <h1 id={titleId}>{translate("otpTitle")}</h1>
          <p id={codeDescriptionId}>
            {translate("otpDescription", { phone: `\u2066${number}\u2069` })}
          </p>
        </>
      );
    }
    case "totp":
      return (
        <>
          <h1 id={titleId}>{translate("totpTitle")}</h1>
          <p id={codeDescriptionId}>{translate("totpDescription")}</p>
        </>
      );
    case "done":
      return (
        <>
          <h1 id={titleId}>{translate("successTitle")}</h1>
          <p>{translate("successDescription")}</p>
        </>
      );
  }
}

function sendLabel(flow: PhoneSignIn) {
  if (flow.pending === "send") return "sendingCode";
  return flow.retryRequest ? "retrySend" : "sendCode";
}

function resendLabel(flow: PhoneSignIn, translate: Translate): string {
  if (flow.pending === "send" || flow.retryRequest) return translate(sendLabel(flow));
  return flow.resendSeconds > 0
    ? translate("resendIn", { seconds: String(flow.resendSeconds) })
    : translate("resendCode");
}

function ChallengeActions({ flow, translate }: { flow: PhoneSignIn; translate: Translate }) {
  return (
    <div className="auth-actions">
      {flow.step.kind === "otp" && (
        <button
          className="auth-secondary"
          type="button"
          disabled={flow.pending !== undefined || flow.resendSeconds > 0}
          onClick={() => void flow.sendCode()}
        >
          {resendLabel(flow, translate)}
        </button>
      )}
      <button
        className="auth-secondary"
        type="button"
        disabled={flow.pending !== undefined}
        onClick={flow.restart}
      >
        {translate(flow.step.kind === "otp" ? "changePhone" : "restart")}
      </button>
    </div>
  );
}

export function SignInForm({ locale, purpose }: { locale: Locale; purpose: OtpPurpose }) {
  const translate = useTranslations("auth");
  const flow = usePhoneSignIn(purpose);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousStep = useRef(flow.step.kind);
  const isPhone = flow.step.kind === "phone";
  const isDone = flow.step.kind === "done";

  useEffect(() => {
    if (previousStep.current === flow.step.kind) return;
    previousStep.current = flow.step.kind;
    if (flow.step.kind === "done") panelRef.current?.focus();
    else inputRef.current?.focus();
  }, [flow.step.kind]);

  useEffect(() => {
    if (flow.error && (flow.step.kind === "phone" || flow.canVerify)) inputRef.current?.focus();
  }, [flow.error, flow.canVerify, flow.step.kind]);

  return (
    <section
      className="auth-panel"
      ref={panelRef}
      tabIndex={isDone ? -1 : undefined}
      aria-labelledby={titleId}
    >
      <div className="auth-heading">
        <span className="brand-mark" aria-hidden="true" />
        <StepHeading flow={flow} purpose={purpose} translate={translate} />
      </div>
      {isDone ? (
        <a className="auth-primary" href={`/${locale}`}>
          {translate("home")}
        </a>
      ) : (
        <form
          method="post"
          className="auth-form"
          aria-busy={flow.pending !== undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void (isPhone ? flow.sendCode() : flow.verifyCode());
          }}
        >
          {isPhone ? (
            <PhoneField flow={flow} translate={translate} inputRef={inputRef} />
          ) : (
            <CodeField key={flow.step.kind} flow={flow} translate={translate} inputRef={inputRef} />
          )}
          {flow.error && (
            <p className="auth-error" id={errorId} role="alert">
              {translate(flow.error)}
            </p>
          )}
          <button
            className="auth-primary"
            type="submit"
            disabled={flow.pending !== undefined || (!isPhone && !flow.canVerify)}
          >
            {translate(
              isPhone
                ? sendLabel(flow)
                : flow.pending === "verify"
                  ? "verifyingCode"
                  : "verifyCode",
            )}
          </button>
          {!isPhone && <ChallengeActions flow={flow} translate={translate} />}
        </form>
      )}
    </section>
  );
}
