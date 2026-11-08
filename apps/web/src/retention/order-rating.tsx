"use client";

import { useTranslations } from "next-intl";
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

function outcomeKey(outcome: RatingSave) {
  if (outcome.kind !== "invalid") return outcomeKeys[outcome.kind];
  if (outcome.field === "comment") return "commentError";
  return outcome.field === "deliveryStars" ? "deliveryStarsError" : "foodStarsError";
}

function Reply({ rating }: { rating: Rating }) {
  const translate = useTranslations("retentionRatings");
  if (rating.reply === null) return null;
  return (
    <blockquote className="rating-reply">
      <p>{translate("restaurantReply")}</p>
      <p>{rating.reply.body}</p>
    </blockquote>
  );
}

function Outcome({ outcome }: { outcome: RatingSave | undefined }) {
  const translate = useTranslations("retentionRatings");
  if (outcome === undefined) return null;
  const isSaved = outcome.kind === "saved";
  return (
    <p
      className={isSaved ? "admin-merchant-success" : "admin-merchant-error"}
      role={isSaved ? "status" : "alert"}
    >
      {translate(outcomeKey(outcome))}
    </p>
  );
}

function RatingFields(props: {
  rating: Rating | null;
  isDelivery: boolean;
  isDisabled: boolean;
  invalidField: string | undefined;
}) {
  const translate = useTranslations("retentionRatings");
  const { rating, isDisabled, invalidField } = props;
  return (
    <>
      <StarField
        name="foodStars"
        legend={translate("food")}
        defaultValue={rating?.foodStars}
        isDisabled={isDisabled}
        isInvalid={invalidField === "foodStars"}
      />
      {props.isDelivery && (
        <StarField
          name="deliveryStars"
          legend={translate("delivery")}
          defaultValue={rating?.deliveryStars ?? undefined}
          isDisabled={isDisabled}
          isInvalid={invalidField === "deliveryStars"}
        />
      )}
      <label className="admin-merchant-field">
        <span>{translate("comment")}</span>
        <textarea
          name="comment"
          maxLength={500}
          defaultValue={rating?.comment ?? ""}
          disabled={isDisabled}
          aria-invalid={invalidField === "comment" || undefined}
        />
      </label>
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
  const invalidField = state.outcome?.kind === "invalid" ? state.outcome.field : undefined;
  return (
    <form
      className="admin-merchant-form"
      aria-busy={state.isSaving}
      onSubmit={(event) => {
        event.preventDefault();
        void state.save(readDraft(event.currentTarget));
      }}
    >
      <RatingFields
        rating={rating}
        isDelivery={isDelivery}
        isDisabled={isDisabled}
        invalidField={invalidField}
      />
      {isLocked ? (
        <p>{translate("closed")}</p>
      ) : (
        <button className="admin-merchant-button" type="submit" disabled={isDisabled}>
          {translate(rating === null ? "submit" : "update")}
        </button>
      )}
      <Outcome outcome={state.outcome} />
    </form>
  );
}

/** CUS-22: rate one order; editable for 24 h; shows the restaurant's reply. */
export function OrderRating({ orderId, isDelivery }: { orderId: string; isDelivery: boolean }) {
  const translate = useTranslations("retentionRatings");
  const state = useOrderRating(orderId, isDelivery);
  const { view } = state;
  return (
    <section className="admin-merchant" aria-labelledby="order-rating-title">
      <header className="admin-merchant-heading">
        <h1 id="order-rating-title">{translate("title")}</h1>
      </header>
      {view.kind === "loading" && <p role="status">{translate("loading")}</p>}
      {view.kind === "ready" && (
        <>
          <RatingForm state={state} rating={view.rating} isDelivery={isDelivery} />
          {view.rating !== null && <Reply rating={view.rating} />}
        </>
      )}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <p role="alert">{translate(outcomeKeys[view.kind])}</p>
      )}
    </section>
  );
}
