"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  promotionDraftToInput,
  promotionWorkedExample,
  type PromotionDraft,
} from "./promotion-draft";
import type { Promotion } from "./promotions-http";
import { usePromotions, type PromotionsState } from "./use-promotions";

type TextField =
  | "code"
  | "percent"
  | "capDzd"
  | "amountDzd"
  | "minimumSubtotalDzd"
  | "startsOn"
  | "endsOn"
  | "maxUsesTotal"
  | "maxUsesPerCustomer";
const discountKinds = ["percent", "fixed", "free_delivery"] as const;
const discountKeys = {
  percent: "kindPercent",
  fixed: "kindFixed",
  free_delivery: "kindFreeDelivery",
} as const;

function useMoney() {
  const format = useFormatter();
  return (amountDzd: number) =>
    format.number(amountDzd, { style: "currency", currency: "DZD", maximumFractionDigits: 0 });
}

function Field(props: { field: TextField; state: PromotionsState; type?: "date" }) {
  const translate = useTranslations("retentionPromotions");
  const { field, state } = props;
  const isInvalid = typeof state.outcome === "object" && state.outcome.invalid === field;
  return (
    <label className="admin-merchant-field">
      <span>{translate(field)}</span>
      <input
        name={field}
        type={props.type ?? "text"}
        value={state.draft[field]}
        inputMode={props.type === undefined && field !== "code" ? "numeric" : undefined}
        dir="ltr"
        aria-invalid={isInvalid || undefined}
        disabled={state.isSaving}
        onChange={(event) => {
          state.change(field, event.currentTarget.value);
        }}
      />
    </label>
  );
}

function DiscountFields({ state }: { state: PromotionsState }) {
  const translate = useTranslations("retentionPromotions");
  const { draft } = state;
  return (
    <fieldset disabled={state.isSaving}>
      <legend>{translate("discount")}</legend>
      {discountKinds.map((kind) => (
        <label key={kind}>
          <input
            type="radio"
            name="discountKind"
            checked={draft.discountKind === kind}
            onChange={() => {
              state.change("discountKind", kind);
            }}
          />{" "}
          {translate(discountKeys[kind])}
        </label>
      ))}
      {draft.discountKind === "percent" && (
        <>
          <Field field="percent" state={state} />
          <Field field="capDzd" state={state} />
        </>
      )}
      {draft.discountKind === "fixed" && <Field field="amountDzd" state={state} />}
    </fieldset>
  );
}

function ActivationFields({ state }: { state: PromotionsState }) {
  const translate = useTranslations("retentionPromotions");
  const choose = (activation: PromotionDraft["activation"]) => () => {
    state.change("activation", activation);
  };
  return (
    <fieldset disabled={state.isSaving}>
      <legend>{translate("activation")}</legend>
      <label>
        <input
          type="radio"
          name="activation"
          checked={state.draft.activation === "automatic"}
          onChange={choose("automatic")}
        />{" "}
        {translate("automatic")}
      </label>
      <label>
        <input
          type="radio"
          name="activation"
          checked={state.draft.activation === "code"}
          onChange={choose("code")}
        />{" "}
        {translate("withCode")}
      </label>
      {state.draft.activation === "code" && <Field field="code" state={state} />}
    </fieldset>
  );
}

function ConditionFields({ state }: { state: PromotionsState }) {
  const translate = useTranslations("retentionPromotions");
  return (
    <fieldset disabled={state.isSaving}>
      <legend>{translate("conditions")}</legend>
      <Field field="minimumSubtotalDzd" state={state} />
      <Field field="startsOn" state={state} type="date" />
      <Field field="endsOn" state={state} type="date" />
      <label>
        <input
          type="checkbox"
          checked={state.draft.isFirstOrderOnly}
          onChange={(event) => {
            state.change("isFirstOrderOnly", event.currentTarget.checked);
          }}
        />{" "}
        {translate("firstOrderOnly")}
      </label>
      <Field field="maxUsesTotal" state={state} />
      <Field field="maxUsesPerCustomer" state={state} />
    </fieldset>
  );
}

function WorkedExample({ draft }: { draft: PromotionDraft }) {
  const translate = useTranslations("retentionPromotions");
  const money = useMoney();
  const parsed = promotionDraftToInput(draft);
  const example =
    parsed.kind === "ready" ? promotionWorkedExample(parsed.input.discount) : undefined;
  return (
    <aside className="promotion-example" aria-live="polite">
      <h2>{translate("exampleTitle")}</h2>
      {example === undefined ? (
        <p>{translate("exampleIncomplete")}</p>
      ) : (
        <dl className="merchant-billing-plan">
          <dt>{translate("exampleSubtotal")}</dt>
          <dd>{money(example.subtotalDzd)}</dd>
          <dt>{translate("exampleDiscount")}</dt>
          <dd>{money(example.discountDzd)}</dd>
          <dt>{translate("exampleDelivery")}</dt>
          <dd>{money(example.deliveryFeeDzd)}</dd>
          <dt>{translate("exampleTotal")}</dt>
          <dd>{money(example.totalDzd)}</dd>
        </dl>
      )}
    </aside>
  );
}

function outcomeKey(outcome: NonNullable<PromotionsState["outcome"]>) {
  if (typeof outcome === "object") return "invalid";
  return (
    {
      saved: "saved",
      "duplicate-code": "duplicateCode",
      "sign-in": "signInRequired",
      error: "saveError",
    } as const
  )[outcome];
}

function Editor({ state }: { state: PromotionsState }) {
  const translate = useTranslations("retentionPromotions");
  const { outcome } = state;
  return (
    <form
      className="admin-merchant-form"
      aria-busy={state.isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        void state.save();
      }}
    >
      <h2>{translate(state.editingId === undefined ? "newPromotion" : "editPromotion")}</h2>
      <ActivationFields state={state} />
      <DiscountFields state={state} />
      <ConditionFields state={state} />
      <WorkedExample draft={state.draft} />
      <button className="admin-merchant-button" type="submit" disabled={state.isSaving}>
        {translate(state.isSaving ? "saving" : "save")}
      </button>
      {outcome !== undefined && (
        <p
          className={outcome === "saved" ? "admin-merchant-success" : "admin-merchant-error"}
          role={outcome === "saved" ? "status" : "alert"}
        >
          {translate(outcomeKey(outcome))}
        </p>
      )}
    </form>
  );
}

function PromotionRow({ promotion, state }: { promotion: Promotion; state: PromotionsState }) {
  const translate = useTranslations("retentionPromotions");
  const money = useMoney();
  const { activation, discount, stats } = promotion;
  return (
    <li className="admin-billing-facts">
      <bdi>{activation.kind === "code" ? activation.code : translate("automatic")}</bdi>
      <span>{translate(discountKeys[discount.kind])}</span>
      <span>{translate("uses", { count: stats.uses })}</span>
      <span>{translate("sales", { amount: money(stats.salesDzd) })}</span>
      <button
        className="admin-merchant-button"
        type="button"
        onClick={() => {
          state.edit(promotion);
        }}
      >
        {translate("edit")}
      </button>
    </li>
  );
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "loadError",
} as const;

/** MER-19: promotions list with stats and an editor with a worked example. */
export function PromotionsEditor({ merchantId }: { merchantId: string }) {
  const translate = useTranslations("retentionPromotions");
  const state = usePromotions(merchantId);
  const { view } = state;
  return (
    <section className="admin-merchant" aria-labelledby="promotions-title">
      <header className="admin-merchant-heading">
        <h1 id="promotions-title">{translate("title")}</h1>
        <p>{translate("intro")}</p>
      </header>
      {view.kind === "loading" && <p role="status">{translate("loading")}</p>}
      {view.kind === "ready" && (
        <>
          {view.promotions.length === 0 ? (
            <p>{translate("empty")}</p>
          ) : (
            <ul className="admin-billing-list">
              {view.promotions.map((promotion) => (
                <PromotionRow key={promotion.promotionId} promotion={promotion} state={state} />
              ))}
            </ul>
          )}
          <button
            className="admin-merchant-button"
            type="button"
            onClick={() => {
              state.edit(undefined);
            }}
          >
            {translate("newPromotion")}
          </button>
          <Editor state={state} />
        </>
      )}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <p role="alert">{translate(failureKeys[view.kind])}</p>
      )}
    </section>
  );
}
