"use client";

import { Button, Card, ErrorState, Icon, Skeleton, TextAreaField, useToast } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { isEditable, type OrderRating as Rating, type RatingSave } from "./ratings-http";
import { StarField } from "./star-field";
import { useOrderRating, type OrderRatingState } from "./use-order-rating";

function readStars(data: FormData, name: string): number | undefined {
  const value = data.get(name);
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

function readDraft(form: HTMLFormElement) {
  const data = new FormData(form);
  const comment = data.get("comment");
  return {
    foodStars: readStars(data, "foodStars") ?? 0,
    deliveryStars: readStars(data, "deliveryStars"),
    comment: typeof comment === "string" ? comment : "",
  };
}

const outcomeKeys = {
  saved: "saved",
  closed: "closed",
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "saveError",
} as const;

type ErrorKey = "commentError" | "deliveryStarsError" | "foodStarsError";

function errorKey(outcome: RatingSave | undefined, field: string): ErrorKey | undefined {
  if (outcome?.kind !== "invalid" || outcome.field !== field) return undefined;
  if (field === "comment") return "commentError";
  return field === "deliveryStars" ? "deliveryStarsError" : "foodStarsError";
}

function Reply({ rating }: { rating: Rating }) {
  const translate = useTranslations("retentionRatings");
  if (rating.reply === null) return null;
  return (
    <Card tone="sunken">
      <p className="rating-reply-label">
        <Icon name="reply" size={18} />
        {translate("restaurantReply")}
      </p>
      <p>{rating.reply.body}</p>
    </Card>
  );
}

function FieldError({ messageKey }: { messageKey: ErrorKey | undefined }) {
  const translate = useTranslations("retentionRatings");
  if (messageKey === undefined) return null;
  return (
    <p className="ui-field-error" role="alert">
      {translate(messageKey)}
    </p>
  );
}

function RatingStars(props: {
  rating: Rating | null;
  isDelivery: boolean;
  isDisabled: boolean;
  outcome: RatingSave | undefined;
}) {
  const translate = useTranslations("retentionRatings");
  const { rating, isDisabled } = props;
  const foodError = errorKey(props.outcome, "foodStars");
  const deliveryError = errorKey(props.outcome, "deliveryStars");
  return (
    <>
      <StarField
        name="foodStars"
        legend={translate("food")}
        defaultValue={rating?.foodStars}
        isDisabled={isDisabled}
        isInvalid={foodError !== undefined}
      />
      <FieldError messageKey={foodError} />
      {props.isDelivery && (
        <>
          <StarField
            name="deliveryStars"
            legend={translate("delivery")}
            defaultValue={rating?.deliveryStars ?? undefined}
            isDisabled={isDisabled}
            isInvalid={deliveryError !== undefined}
          />
          <FieldError messageKey={deliveryError} />
        </>
      )}
    </>
  );
}

function RatingForm(props: {
  state: OrderRatingState;
  rating: Rating | null;
  isDelivery: boolean;
}) {
  const translate = useTranslations("retentionRatings");
  const { state, rating, isDelivery } = props;
  const isLocked = rating !== null && !isEditable(rating.editableUntil, Date.now());
  const isDisabled = state.isSaving || isLocked;
  const commentError = errorKey(state.outcome, "comment");
  return (
    <form
      className="rating-form"
      aria-busy={state.isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        void state.save(readDraft(event.currentTarget));
      }}
    >
      <RatingStars
        rating={rating}
        isDelivery={isDelivery}
        isDisabled={isDisabled}
        outcome={state.outcome}
      />
      <TextAreaField
        label={translate("comment")}
        name="comment"
        maxLength={500}
        defaultValue={rating?.comment ?? ""}
        disabled={isDisabled}
        error={commentError === undefined ? undefined : translate(commentError)}
      />
      {isLocked ? (
        <p className="ui-field-hint">{translate("closed")}</p>
      ) : (
        <Button type="submit" variant="primary" size="lg" isBlock isLoading={state.isSaving}>
          {translate(rating === null ? "submit" : "update")}
        </Button>
      )}
    </form>
  );
}

function useOutcomeToast(state: OrderRatingState) {
  const translate = useTranslations("retentionRatings");
  const toast = useToast();
  const { outcome } = state;
  useEffect(() => {
    if (outcome === undefined || outcome.kind === "invalid") return;
    toast.show(
      translate(outcomeKeys[outcome.kind]),
      outcome.kind === "saved" ? "success" : "danger",
    );
  }, [outcome, toast, translate]);
}

/** CUS-22 view (page and design gallery). */
export function OrderRatingView({
  state,
  isDelivery,
}: {
  state: OrderRatingState;
  isDelivery: boolean;
}) {
  const translate = useTranslations("retentionRatings");
  useOutcomeToast(state);
  const { view } = state;
  return (
    <section className="rating-page" aria-labelledby="order-rating-title">
      <header className="rating-hero">
        <span className="rating-hero-icon" aria-hidden="true">
          <Icon name="plate" size={32} />
        </span>
        <h1 id="order-rating-title" className="ui-page-title">
          {translate("title")}
        </h1>
        <p className="ui-page-intro">{translate("intro")}</p>
      </header>
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={5} />}
      {view.kind === "ready" && (
        <>
          <Card>
            <RatingForm state={state} rating={view.rating} isDelivery={isDelivery} />
          </Card>
          {view.rating !== null && <Reply rating={view.rating} />}
        </>
      )}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <ErrorState title={translate(outcomeKeys[view.kind])} />
      )}
    </section>
  );
}

/** CUS-22: rate one order; editable for 24 h; shows the restaurant's reply. */
export function OrderRating({ orderId, isDelivery }: { orderId: string; isDelivery: boolean }) {
  return <OrderRatingView state={useOrderRating(orderId, isDelivery)} isDelivery={isDelivery} />;
}
