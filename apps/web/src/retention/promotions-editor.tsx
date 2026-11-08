"use client";

import { formatDzd } from "@zaafran/i18n/formats";
import type { Locale } from "@zaafran/i18n/locales";
import {
  ActionBar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormGrid,
  Icon,
  MoneyField,
  PageHeader,
  SegmentedControl,
  Skeleton,
  TextField,
  Toggle,
  useToast,
} from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, type ChangeEvent } from "react";
import {
  promotionDraftToInput,
  promotionWorkedExample,
  type PromotionDraft,
} from "./promotion-draft";
import type { Promotion } from "./promotions-http";
import { usePromotions, type PromotionsState } from "./use-promotions";

type TextKey =
  | "code"
  | "percent"
  | "capDzd"
  | "amountDzd"
  | "minimumSubtotalDzd"
  | "startsOn"
  | "endsOn"
  | "maxUsesTotal"
  | "maxUsesPerCustomer";
type Kind = PromotionDraft["discountKind"];
const discountKeys = {
  percent: "kindPercent",
  fixed: "kindFixed",
  free_delivery: "kindFreeDelivery",
} as const satisfies Readonly<Record<Kind, string>>;
const discountIcons = { percent: "tag", fixed: "card", free_delivery: "bike" } as const;
const moneyKeys: ReadonlySet<TextKey> = new Set(["capDzd", "amountDzd", "minimumSubtotalDzd"]);
const dateKeys: ReadonlySet<TextKey> = new Set(["startsOn", "endsOn"]);
const percentUnit = "%";

function useInputProps(key: TextKey, state: PromotionsState) {
  const translate = useTranslations("retentionPromotions");
  const isInvalid = typeof state.outcome === "object" && state.outcome.invalid === key;
  return {
    label: translate(key),
    name: key,
    value: state.draft[key],
    disabled: state.isSaving,
    error: isInvalid ? translate("invalid") : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      state.change(key, event.currentTarget.value);
    },
  };
}

function DraftField({
  field,
  state,
  locale,
}: {
  field: TextKey;
  state: PromotionsState;
  locale: Locale;
}) {
  const props = useInputProps(field, state);
  if (moneyKeys.has(field)) return <MoneyField {...props} unit={locale === "ar" ? "دج" : "DA"} />;
  if (dateKeys.has(field)) return <TextField {...props} type="date" width="short" />;
  if (field === "percent")
    return (
      <TextField {...props} width="short" suffix={percentUnit} inputMode="decimal" dir="ltr" />
    );
  if (field === "code")
    return <TextField {...props} width="short" dir="ltr" autoCapitalize="characters" />;
  return <TextField {...props} width="short" inputMode="numeric" dir="ltr" />;
}

function DiscountCard({ state, locale }: { state: PromotionsState; locale: Locale }) {
  const translate = useTranslations("retentionPromotions");
  const { draft } = state;
  const options = (["percent", "fixed", "free_delivery"] as const).map((kind) => ({
    value: kind,
    label: translate(discountKeys[kind]),
    icon: discountIcons[kind],
  }));
  const activations = [
    { value: "automatic" as const, label: translate("automatic") },
    { value: "code" as const, label: translate("withCode") },
  ];
  return (
    <Card title={translate("discount")} titleId="promotion-discount">
      <SegmentedControl
        legend={translate("activation")}
        name="activation"
        value={draft.activation}
        options={activations}
        disabled={state.isSaving}
        onChange={(value) => {
          state.change("activation", value);
        }}
      />
      {draft.activation === "code" && <DraftField field="code" state={state} locale={locale} />}
      <SegmentedControl
        legend={translate("discountType")}
        name="discountKind"
        value={draft.discountKind}
        options={options}
        disabled={state.isSaving}
        onChange={(value) => {
          state.change("discountKind", value);
        }}
      />
      <FormGrid>
        {draft.discountKind === "percent" && (
          <>
            <DraftField field="percent" state={state} locale={locale} />
            <DraftField field="capDzd" state={state} locale={locale} />
          </>
        )}
        {draft.discountKind === "fixed" && (
          <DraftField field="amountDzd" state={state} locale={locale} />
        )}
      </FormGrid>
    </Card>
  );
}

function ConditionsCard({ state, locale }: { state: PromotionsState; locale: Locale }) {
  const translate = useTranslations("retentionPromotions");
  return (
    <Card title={translate("conditions")} titleId="promotion-conditions">
      <FormGrid>
        <DraftField field="minimumSubtotalDzd" state={state} locale={locale} />
        <DraftField field="startsOn" state={state} locale={locale} />
        <DraftField field="endsOn" state={state} locale={locale} />
        <DraftField field="maxUsesTotal" state={state} locale={locale} />
        <DraftField field="maxUsesPerCustomer" state={state} locale={locale} />
      </FormGrid>
      <Toggle
        label={translate("firstOrderOnly")}
        description={translate("firstOrderOnlyHint")}
        checked={state.draft.isFirstOrderOnly}
        disabled={state.isSaving}
        onChange={(checked) => {
          state.change("isFirstOrderOnly", checked);
        }}
      />
    </Card>
  );
}

function WorkedExample({ draft, locale }: { draft: PromotionDraft; locale: Locale }) {
  const translate = useTranslations("retentionPromotions");
  const parsed = promotionDraftToInput(draft);
  const example =
    parsed.kind === "ready" ? promotionWorkedExample(parsed.input.discount) : undefined;
  const money = (amountDzd: number) => (
    <bdi className="billing-money">{formatDzd(amountDzd, locale)}</bdi>
  );
  return (
    <Card title={translate("exampleTitle")} titleId="promotion-example" tone="sunken">
      <div aria-live="polite">
        {example === undefined ? (
          <p className="ui-field-hint">{translate("exampleIncomplete")}</p>
        ) : (
          <dl className="promotion-receipt">
            <dt>{translate("exampleSubtotal")}</dt>
            <dd>{money(example.subtotalDzd)}</dd>
            <dt>{translate("exampleDiscount")}</dt>
            <dd className="promotion-receipt-saving">
              {translate("exampleSaving", { amount: formatDzd(example.discountDzd, locale) })}
            </dd>
            <dt>{translate("exampleDelivery")}</dt>
            <dd>{money(example.deliveryFeeDzd)}</dd>
            <dt className="promotion-receipt-total">{translate("exampleTotal")}</dt>
            <dd className="promotion-receipt-total">{money(example.totalDzd)}</dd>
          </dl>
        )}
      </div>
    </Card>
  );
}

function Editor({ state, locale }: { state: PromotionsState; locale: Locale }) {
  const translate = useTranslations("retentionPromotions");
  return (
    <form
      className="promotion-editor"
      aria-busy={state.isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        void state.save();
      }}
    >
      <div className="billing-layout">
        <h2 className="ui-card-title">
          {translate(state.editingId === undefined ? "newPromotion" : "editPromotion")}
        </h2>
        <DiscountCard state={state} locale={locale} />
        <ConditionsCard state={state} locale={locale} />
        <ActionBar>
          <Button
            variant="ghost"
            onClick={() => {
              state.edit(undefined);
            }}
          >
            {translate("reset")}
          </Button>
          <Button type="submit" variant="primary" size="lg" isLoading={state.isSaving}>
            {translate(state.isSaving ? "saving" : "save")}
          </Button>
        </ActionBar>
      </div>
      <div className="promotion-aside">
        <WorkedExample draft={state.draft} locale={locale} />
      </div>
    </form>
  );
}

function PromotionCard({
  promotion,
  state,
  locale,
}: {
  promotion: Promotion;
  state: PromotionsState;
  locale: Locale;
}) {
  const translate = useTranslations("retentionPromotions");
  const { activation, discount, stats } = promotion;
  const isEditing = state.editingId === promotion.promotionId;
  return (
    <li className="promotion-card" data-active={isEditing || undefined}>
      <span className="billing-row-icon" aria-hidden="true">
        <Icon name={discountIcons[discount.kind]} />
      </span>
      <div className="billing-row-main">
        <p className="billing-row-title">
          {activation.kind === "code" ? (
            <bdi dir="ltr" className="promotion-code">
              {activation.code}
            </bdi>
          ) : (
            translate("automatic")
          )}
          <Badge tone="primary">{translate(discountKeys[discount.kind])}</Badge>
        </p>
        <p className="billing-row-meta">
          <span>{translate("uses", { count: stats.uses })}</span>
          <span>{translate("sales", { amount: formatDzd(stats.salesDzd, locale) })}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon="settings"
        onClick={() => {
          state.edit(promotion);
        }}
        aria-pressed={isEditing}
      >
        {translate("edit")}
      </Button>
    </li>
  );
}

function outcomeMessage(outcome: NonNullable<PromotionsState["outcome"]>) {
  if (typeof outcome === "object") return undefined;
  return (
    {
      saved: "saved",
      "duplicate-code": "duplicateCode",
      "sign-in": "signInRequired",
      error: "saveError",
    } as const
  )[outcome];
}

function useOutcomeToast(state: PromotionsState) {
  const translate = useTranslations("retentionPromotions");
  const toast = useToast();
  const { outcome, outcomeId } = state;
  useEffect(() => {
    if (outcome === undefined) return;
    const key = outcomeMessage(outcome);
    if (key !== undefined) toast.show(translate(key), outcome === "saved" ? "success" : "danger");
  }, [outcome, outcomeId, toast, translate]);
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "loadError",
} as const;

/** MER-19 view (page and design gallery). */
export function PromotionsView({ state, locale }: { state: PromotionsState; locale: Locale }) {
  const translate = useTranslations("retentionPromotions");
  useOutcomeToast(state);
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="promotions-title">
      <PageHeader
        title={translate("title")}
        intro={translate("intro")}
        titleId="promotions-title"
      />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={6} />}
      {view.kind === "ready" && (
        <div className="billing-layout">
          <Card title={translate("activeTitle")} titleId="promotions-active">
            {view.promotions.length === 0 ? (
              <EmptyState icon="tag" title={translate("empty")} body={translate("emptyBody")} />
            ) : (
              <ul className="billing-rows">
                {view.promotions.map((promotion) => (
                  <PromotionCard
                    key={promotion.promotionId}
                    promotion={promotion}
                    state={state}
                    locale={locale}
                  />
                ))}
              </ul>
            )}
          </Card>
          <Editor state={state} locale={locale} />
        </div>
      )}
      {view.kind === "error" && <ErrorState title={translate("loadError")} />}
      {(view.kind === "sign-in" || view.kind === "not-found") && (
        <ErrorState title={translate(failureKeys[view.kind])} />
      )}
    </section>
  );
}

/** MER-19: promotions list with stats and an editor with a worked example. */
export function PromotionsEditor({ merchantId, locale }: { merchantId: string; locale: Locale }) {
  return <PromotionsView state={usePromotions(merchantId)} locale={locale} />;
}
