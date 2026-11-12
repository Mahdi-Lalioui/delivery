"use client";

import { isPublicLocale, type Locale } from "@zaafran/i18n/locales";
import { formatAlgerianPhone } from "@zaafran/i18n/phone";
import { SegmentedControl, Skeleton } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { readSignInMethods, type OtpPurpose, type SignInMethod } from "../auth/auth-http";
import type { SignInDestination } from "../auth/sign-in-intent";
import { useSignIn, type SignInFlow } from "../auth/use-sign-in";

const errorId = "sign-in-error";
const titleId = "sign-in-title";
const codeDescriptionId = "sign-in-code-description";
const digitSlots = [0, 1, 2, 3, 4, 5];

type Translate = ReturnType<typeof useTranslations<"auth">>;
type InputRef = React.RefObject<HTMLInputElement | null>;

interface FieldProps {
  flow: SignInFlow;
  translate: Translate;
  inputRef: InputRef;
}

function IdentifierField({ flow, translate, inputRef }: FieldProps) {
  const email = flow.method === "email";
  const field = email ? "sign-in-email" : "sign-in-phone";
  const hint = field + "-hint";
  return (
    <div className="auth-field">
      <label htmlFor={field}>{translate(email ? "emailLabel" : "phoneLabel")}</label>
      <input
        key={field}
        id={field}
        ref={inputRef}
        type={email ? "email" : "tel"}
        autoComplete={email ? "email" : "tel"}
        autoCapitalize="none"
        spellCheck={false}
        placeholder={translate(email ? "emailPlaceholder" : "phonePlaceholder")}
        dir="ltr"
        value={email ? flow.email : flow.phone}
        readOnly={flow.pending !== undefined}
        onChange={(event) => {
          (email ? flow.setEmail : flow.setPhone)(event.currentTarget.value);
        }}
        aria-invalid={flow.error === (email ? "invalidEmail" : "invalidPhone")}
        aria-describedby={flow.error ? hint + " " + errorId : hint}
        className="auth-phone-input"
      />
      <p className="auth-hint" id={hint}>
        {translate(email ? "emailHint" : "phoneHint")}
      </p>
    </div>
  );
}

function MethodPicker({
  methods,
  flow,
  translate,
}: {
  methods: readonly SignInMethod[];
  flow: SignInFlow;
  translate: Translate;
}) {
  if (methods.length < 2) return null;
  return (
    <SegmentedControl
      legend={translate("methodLabel")}
      name="sign-in-method"
      options={methods.map((value) => ({
        value,
        label: translate(value === "phone" ? "phoneMethod" : "emailMethod"),
      }))}
      value={flow.method}
      disabled={flow.pending !== undefined}
      onChange={flow.setMethod}
    />
  );
}

function CodeField({ flow, translate, inputRef }: FieldProps) {
  const [selection, setSelection] = useState(0);
  const step = flow.step;
  const isOtp = step.kind === "otp";
  const label = isOtp ? (step.email === undefined ? "otpLabel" : "emailOtpLabel") : "totpLabel";
  const hasInvalidCode =
    flow.error === "invalidCode" || flow.error === "otpInvalid" || flow.error === "totpInvalid";

  return (
    <div className="auth-field">
      <label htmlFor="sign-in-code">{translate(label)}</label>
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
  hasMethod,
}: {
  flow: SignInFlow;
  hasMethod: boolean;
  purpose: OtpPurpose;
  translate: Translate;
}) {
  switch (flow.step.kind) {
    case "phone":
      return (
        <>
          <h1 id={titleId}>{translate(purpose === "admin_sign_in" ? "adminTitle" : "title")}</h1>
          {hasMethod && (
            <p>{translate(flow.method === "email" ? "emailDescription" : "phoneDescription")}</p>
          )}
        </>
      );
    case "otp": {
      const { email, phone } = flow.step;
      const destination = email === undefined ? (formatAlgerianPhone(phone) ?? phone) : email;
      return (
        <>
          <h1 id={titleId}>{translate("otpTitle")}</h1>
          <p id={codeDescriptionId}>
            {translate("otpDescription", { phone: `\u2066${destination}\u2069` })}
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

function sendLabel(flow: SignInFlow) {
  if (flow.pending === "send") return "sendingCode";
  return flow.retryRequest ? "retrySend" : "sendCode";
}

function resendLabel(flow: SignInFlow, translate: Translate): string {
  if (flow.pending === "send" || flow.retryRequest) return translate(sendLabel(flow));
  return flow.resendSeconds > 0
    ? translate("resendIn", { seconds: String(flow.resendSeconds) })
    : translate("resendCode");
}

function ChallengeActions({ flow, translate }: { flow: SignInFlow; translate: Translate }) {
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
        {translate(
          flow.step.kind === "otp"
            ? flow.step.email === undefined
              ? "changePhone"
              : "changeEmail"
            : "restart",
        )}
      </button>
    </div>
  );
}

function SignInActions({
  locale,
  destination,
  translate,
}: {
  locale: Locale;
  destination: SignInDestination | undefined;
  translate: Translate;
}) {
  return (
    <div className="auth-actions">
      {destination && (
        <a className="auth-primary" href={destination.href}>
          {translate(destination.label)}
        </a>
      )}
      <a
        className={destination ? "auth-secondary" : "auth-primary"}
        href={`/${locale}/account/sessions`}
      >
        {translate("manageDevices")}
      </a>
      <a className="auth-secondary" href={`/${locale}`}>
        {translate("home")}
      </a>
    </div>
  );
}

function useAvailableMethods(initialMethods: readonly SignInMethod[] | undefined) {
  const [remote, setRemote] = useState<readonly SignInMethod[] | "error">();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (initialMethods !== undefined) return;
    const controller = new AbortController();
    void readSignInMethods(controller.signal).then((methods) => {
      if (!controller.signal.aborted) setRemote(methods ?? "error");
    });
    return () => {
      controller.abort();
    };
  }, [initialMethods, revision]);
  return {
    available: initialMethods ?? remote,
    retry: () => {
      setRemote(undefined);
      setRevision((value) => value + 1);
    },
  };
}

function MethodsState({
  available,
  retry,
  translate,
}: {
  available: "error" | readonly SignInMethod[] | undefined;
  retry: () => void;
  translate: Translate;
}) {
  if (available === undefined) return <Skeleton lines={2} label={translate("methodsLoading")} />;
  return (
    <div className="auth-actions">
      <p className="auth-hint" role="status">
        {translate(available === "error" ? "methodsError" : "methodsUnavailable")}
      </p>
      <button className="auth-secondary" type="button" onClick={retry}>
        {translate("retryMethods")}
      </button>
    </div>
  );
}

function SignInCommandForm({
  flow,
  methods,
  inputRef,
  translate,
}: FieldProps & { methods: readonly SignInMethod[] }) {
  const isPhone = flow.step.kind === "phone";
  return (
    <form
      method="post"
      noValidate
      className="auth-form"
      aria-busy={flow.pending !== undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void (isPhone ? flow.sendCode() : flow.verifyCode());
      }}
    >
      {isPhone ? (
        <>
          <MethodPicker methods={methods} flow={flow} translate={translate} />
          <IdentifierField flow={flow} translate={translate} inputRef={inputRef} />
        </>
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
          isPhone ? sendLabel(flow) : flow.pending === "verify" ? "verifyingCode" : "verifyCode",
        )}
      </button>
      {!isPhone && <ChallengeActions flow={flow} translate={translate} />}
    </form>
  );
}

export function SignInForm({
  locale,
  purpose,
  destination,
  initialMethods,
}: {
  locale: Locale;
  purpose: OtpPurpose;
  destination?: SignInDestination | undefined;
  initialMethods?: readonly SignInMethod[];
}) {
  const translate = useTranslations("auth");
  const { available, retry } = useAvailableMethods(initialMethods);
  const methods = available === "error" ? [] : (available ?? []);
  const flow = useSignIn(purpose, methods, isPublicLocale(locale) ? locale : undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousStep = useRef(flow.step.kind);
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
        <StepHeading
          flow={flow}
          purpose={purpose}
          translate={translate}
          hasMethod={methods.length > 0}
        />
      </div>
      {methods.length === 0 ? (
        <MethodsState available={available} retry={retry} translate={translate} />
      ) : isDone ? (
        <SignInActions locale={locale} destination={destination} translate={translate} />
      ) : (
        <SignInCommandForm
          flow={flow}
          methods={methods}
          inputRef={inputRef}
          translate={translate}
        />
      )}
    </section>
  );
}
