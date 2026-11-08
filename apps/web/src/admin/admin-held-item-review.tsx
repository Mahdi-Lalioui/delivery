import { localeDetails, publicLocales } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { HeldItem, HeldReviewDraft, HeldReviewField } from "./admin-moderation-http";
import type { AdminHeldItemsState } from "./use-admin-held-items";

type LocalizedText = Readonly<{
  ar?: string | undefined;
  fr?: string | undefined;
  en?: string | undefined;
}>;

function LocalizedValues({ values, empty }: { values: LocalizedText; empty: string }) {
  const present = publicLocales.flatMap((locale) => {
    const value = values[locale];
    return value === undefined ? [] : [{ locale, value }];
  });
  if (present.length === 0) return <p>{empty}</p>;

  return (
    <ul className="admin-merchant-cuisines">
      {present.map(({ locale, value }) => {
        const { tag, direction } = localeDetails[locale];
        return (
          <li key={locale}>
            <bdi lang={tag} dir={direction}>
              {value}
            </bdi>
          </li>
        );
      })}
    </ul>
  );
}

function ItemDetails({ item }: { item: HeldItem }) {
  const translate = useTranslations("adminModeration");
  return (
    <dl className="admin-merchant-details">
      <div>
        <dt>{translate("restaurant")}</dt>
        <dd>
          <bdi>{item.restaurantName}</bdi>
        </dd>
      </div>
      <div>
        <dt>{translate("names")}</dt>
        <dd>
          <LocalizedValues values={item.names} empty={translate("noDescription")} />
        </dd>
      </div>
      <div>
        <dt>{translate("descriptions")}</dt>
        <dd>
          <LocalizedValues values={item.descriptions} empty={translate("noDescription")} />
        </dd>
      </div>
    </dl>
  );
}

function DecisionChoices({
  draft,
  invalid,
  onChange,
}: {
  draft: HeldReviewDraft;
  invalid: HeldReviewField | undefined;
  onChange: (decision: "approve" | "reject") => void;
}) {
  const translate = useTranslations("adminModeration");
  return (
    <div className="admin-merchant-choices">
      {(["approve", "reject"] as const).map((option) => (
        <label className="admin-merchant-choice" key={option}>
          <input
            type="radio"
            name="admin-item-decision"
            value={option}
            checked={draft.decision === option}
            aria-invalid={invalid === "decision"}
            aria-describedby={invalid === "decision" ? "admin-item-decision-error" : undefined}
            onChange={() => {
              onChange(option);
            }}
          />
          {translate(option)}
        </label>
      ))}
    </div>
  );
}

function ReviewForm({ state }: { state: AdminHeldItemsState }) {
  const translate = useTranslations("adminModeration");
  const [draft, setDraft] = useState<HeldReviewDraft>({ decision: "", reason: "" });
  const [invalid, setInvalid] = useState<HeldReviewField>();
  const form = useRef<HTMLFormElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (invalid === "decision") form.current?.querySelector("input")?.focus();
    if (invalid === "reason") reasonInput.current?.focus();
  }, [invalid]);

  const reasonHelp =
    invalid === "reason"
      ? "admin-item-reason-hint admin-item-reason-error"
      : "admin-item-reason-hint";
  return (
    <form
      ref={form}
      method="post"
      className="admin-merchant-form"
      aria-busy={state.isSaving}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void state.save(draft).then(setInvalid);
      }}
    >
      <fieldset disabled={state.isSaving || state.isPaging}>
        <legend>{translate("review")}</legend>
        <DecisionChoices
          draft={draft}
          invalid={invalid}
          onChange={(decision) => {
            setDraft({ ...draft, decision });
            if (invalid === "decision") setInvalid(undefined);
          }}
        />
        {invalid === "decision" && (
          <p className="admin-merchant-error" role="alert" id="admin-item-decision-error">
            {translate("decisionError")}
          </p>
        )}
        <div className="admin-merchant-field">
          <label htmlFor="admin-item-reason">{translate("reason")}</label>
          <p id="admin-item-reason-hint">{translate("reasonHint")}</p>
          <textarea
            ref={reasonInput}
            id="admin-item-reason"
            value={draft.reason}
            rows={3}
            maxLength={500}
            aria-invalid={invalid === "reason"}
            aria-describedby={reasonHelp}
            onChange={(event) => {
              setDraft({ ...draft, reason: event.currentTarget.value });
              if (invalid === "reason") setInvalid(undefined);
            }}
          />
          {invalid === "reason" && (
            <p className="admin-merchant-error" role="alert" id="admin-item-reason-error">
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

export function AdminHeldItemReview({
  item,
  title,
  state,
}: {
  item: HeldItem;
  title: string;
  state: AdminHeldItemsState;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="admin-merchant-review" aria-labelledby="admin-item-review-title">
      <h2 ref={heading} id="admin-item-review-title" tabIndex={-1}>
        <bdi>{title}</bdi>
      </h2>
      <ItemDetails item={item} />
      <ReviewForm state={state} />
    </section>
  );
}
