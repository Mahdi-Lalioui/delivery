import { formatAlgerianPhone } from "@zaafran/i18n/phone";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type {
  AdminApplication,
  ReviewDecision,
  ReviewValidationField,
} from "./admin-merchant-http";
import type { AdminMerchantQueueState } from "./use-admin-merchant-queue";

function CuisineList({ cuisines }: { cuisines: string[] }) {
  const translate = useTranslations("merchant");
  const labels: ReadonlyMap<string, string> = new Map([
    ["algerian", translate("cuisineAlgerian")],
    ["grill", translate("cuisineGrill")],
    ["pizza", translate("cuisinePizza")],
    ["seafood", translate("cuisineSeafood")],
    ["fried-chicken", translate("cuisineChicken")],
    ["sandwiches", translate("cuisineSandwiches")],
    ["pastry", translate("cuisinePastry")],
    ["healthy", translate("cuisineHealthy")],
  ]);

  return (
    <ul className="admin-merchant-cuisines">
      {cuisines.map((cuisine) => (
        <li key={cuisine}>{labels.get(cuisine) ?? cuisine}</li>
      ))}
    </ul>
  );
}

function ApplicationDetails({
  application,
  locale,
}: {
  application: AdminApplication;
  locale: string;
}) {
  const translate = useTranslations("adminMerchant");
  const coordinate = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 7,
    useGrouping: false,
  });
  const { pin } = application;

  return (
    <dl className="admin-merchant-details">
      <div>
        <dt>{translate("owner")}</dt>
        <dd>
          <bdi>{application.ownerName}</bdi>
        </dd>
      </div>
      <div>
        <dt>{translate("verifiedPhone")}</dt>
        <dd>
          <bdi className="admin-merchant-phone" dir="ltr">
            {formatAlgerianPhone(application.phoneE164) ?? application.phoneE164}
          </bdi>
        </dd>
      </div>
      <div>
        <dt>{translate("commune")}</dt>
        <dd>{application.commune.nameFr}</dd>
      </div>
      <div>
        <dt>{translate("pin")}</dt>
        <dd className="admin-merchant-coordinates">
          <bdi>{coordinate.format(pin.latitude)}</bdi>
          <bdi>{coordinate.format(pin.longitude)}</bdi>
        </dd>
      </div>
      <div>
        <dt>{translate("cuisines")}</dt>
        <dd>
          <CuisineList cuisines={application.cuisines} />
        </dd>
      </div>
      <div>
        <dt>{translate("registration")}</dt>
        <dd>
          <bdi>{application.rcNumber ?? translate("notProvided")}</bdi>
        </dd>
      </div>
    </dl>
  );
}

function ReviewForm({ state }: { state: AdminMerchantQueueState }) {
  const translate = useTranslations("adminMerchant");
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState<ReviewValidationField>();
  const firstDecision = useRef<HTMLInputElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const isBusy = state.isSaving || state.isPaging;

  useEffect(() => {
    if (invalid === "decision") firstDecision.current?.focus();
    if (invalid === "reason") reasonInput.current?.focus();
  }, [invalid]);

  return (
    <form
      method="post"
      className="admin-merchant-form"
      aria-busy={state.isSaving}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void state.save({ decision, reason }).then((field) => {
          setInvalid(field);
        });
      }}
    >
      <fieldset disabled={isBusy}>
        <legend>{translate("review")}</legend>
        <div className="admin-merchant-choices">
          {(["approve", "reject"] as const).map((option) => (
            <label className="admin-merchant-choice" key={option}>
              <input
                ref={option === "approve" ? firstDecision : undefined}
                type="radio"
                name="admin-merchant-decision"
                value={option}
                checked={decision === option}
                aria-invalid={invalid === "decision"}
                aria-describedby={
                  invalid === "decision" ? "admin-review-decision-error" : undefined
                }
                onChange={() => {
                  setDecision(option);
                  if (invalid === "decision") setInvalid(undefined);
                }}
              />
              {translate(option)}
            </label>
          ))}
        </div>
        {invalid === "decision" && (
          <p className="admin-merchant-error" role="alert" id="admin-review-decision-error">
            {translate("decisionError")}
          </p>
        )}
        <div className="admin-merchant-field">
          <label htmlFor="admin-review-reason">{translate("reason")}</label>
          <p id="admin-review-reason-hint">{translate("reasonHint")}</p>
          <textarea
            ref={reasonInput}
            id="admin-review-reason"
            value={reason}
            rows={3}
            maxLength={500}
            aria-invalid={invalid === "reason"}
            aria-describedby={
              invalid === "reason"
                ? "admin-review-reason-hint admin-review-reason-error"
                : "admin-review-reason-hint"
            }
            onChange={(event) => {
              setReason(event.currentTarget.value);
              if (invalid === "reason") setInvalid(undefined);
            }}
          />
          {invalid === "reason" && (
            <p className="admin-merchant-error" role="alert" id="admin-review-reason-error">
              {translate("reasonError")}
            </p>
          )}
        </div>
        <button className="admin-merchant-button admin-merchant-confirm" type="submit">
          {translate(state.isSaving ? "saving" : "confirm")}
        </button>
      </fieldset>
    </form>
  );
}

export function AdminMerchantReview({
  application,
  locale,
  state,
}: {
  application: AdminApplication;
  locale: string;
  state: AdminMerchantQueueState;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="admin-merchant-review" aria-labelledby="admin-review-restaurant">
      <h2 ref={heading} id="admin-review-restaurant" tabIndex={-1}>
        <bdi>{application.restaurantName}</bdi>
      </h2>
      <ApplicationDetails application={application} locale={locale} />
      <ReviewForm state={state} />
    </section>
  );
}
