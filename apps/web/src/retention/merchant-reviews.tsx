"use client";

import { useFormatter, useTranslations } from "next-intl";
import { isEditable, type MerchantReview } from "./ratings-http";
import { useMerchantReviews, type MerchantReviewsState } from "./use-merchant-reviews";

const starFilters = [5, 4, 3, 2, 1] as const;

function readText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

function TextAction(props: {
  name: string;
  label: string;
  submit: string;
  defaultValue?: string;
  isDisabled: boolean;
  onText: (text: string) => void;
}) {
  return (
    <form
      className="admin-billing-action"
      onSubmit={(event) => {
        event.preventDefault();
        props.onText(readText(event.currentTarget, props.name));
      }}
    >
      <label className="admin-merchant-field">
        <span>{props.label}</span>
        <textarea
          name={props.name}
          required
          maxLength={500}
          defaultValue={props.defaultValue}
          disabled={props.isDisabled}
        />
      </label>
      <button className="admin-merchant-button" type="submit" disabled={props.isDisabled}>
        {props.submit}
      </button>
    </form>
  );
}

function noticeKey(notice: NonNullable<MerchantReviewsState["notice"]>) {
  if (notice.result.kind === "saved")
    return notice.action === "reply" ? "replySaved" : "reportSaved";
  if (notice.result.kind === "invalid") return "textError";
  return notice.result.kind === "closed" ? "replyClosed" : "saveError";
}

function ReviewNotice({ notice }: { notice: MerchantReviewsState["notice"] }) {
  const translate = useTranslations("retentionRatings");
  if (notice === undefined) return null;
  const isSaved = notice.result.kind === "saved";
  return (
    <p
      className={isSaved ? "admin-merchant-success" : "admin-merchant-error"}
      role={isSaved ? "status" : "alert"}
    >
      {translate(noticeKey(notice))}
    </p>
  );
}

function ReviewHeader({ review }: { review: MerchantReview }) {
  const translate = useTranslations("retentionRatings");
  const format = useFormatter();
  return (
    <>
      <p className="admin-billing-facts">
        <span>{translate("foodScore", { count: review.foodStars })}</span>
        {review.deliveryStars !== null && (
          <span>{translate("deliveryScore", { count: review.deliveryStars })}</span>
        )}
        <time dateTime={review.createdAt}>
          {format.dateTime(new Date(review.createdAt), {
            dateStyle: "medium",
            timeZone: "Africa/Algiers",
          })}
        </time>
      </p>
      <p>{review.comment ?? translate("noComment")}</p>
      {review.reply !== null && (
        <blockquote className="rating-reply">
          <p>{translate("yourReply")}</p>
          <p>{review.reply.body}</p>
        </blockquote>
      )}
    </>
  );
}

function ReviewItem({ review, state }: { review: MerchantReview; state: MerchantReviewsState }) {
  const translate = useTranslations("retentionRatings");
  const { reply } = review;
  const canReply = reply === null || isEditable(reply.editableUntil, Date.now());
  const notice = state.notice?.ratingId === review.ratingId ? state.notice : undefined;
  return (
    <li className="review-item">
      <ReviewHeader review={review} />
      {canReply && (
        <TextAction
          name="reply"
          label={translate(reply === null ? "reply" : "editReply")}
          submit={translate("sendReply")}
          defaultValue={reply?.body ?? ""}
          isDisabled={state.isSaving}
          onText={(text) => {
            void state.reply(review.ratingId, text);
          }}
        />
      )}
      <details>
        <summary>{translate("report")}</summary>
        <TextAction
          name="reason"
          label={translate("reportReason")}
          submit={translate("sendReport")}
          isDisabled={state.isSaving}
          onText={(text) => {
            void state.report(review.ratingId, text);
          }}
        />
      </details>
      <ReviewNotice notice={notice} />
    </li>
  );
}

function Filter({ state }: { state: MerchantReviewsState }) {
  const translate = useTranslations("retentionRatings");
  return (
    <label className="admin-merchant-field">
      <span>{translate("filter")}</span>
      <select
        value={state.stars === undefined ? "" : String(state.stars)}
        onChange={(event) => {
          const value = event.currentTarget.value;
          state.filter(value === "" ? undefined : Number(value));
        }}
      >
        <option value="">{translate("allStars")}</option>
        {starFilters.map((value) => (
          <option key={value} value={value}>
            {translate("stars", { count: value })}
          </option>
        ))}
      </select>
    </label>
  );
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "loadError",
} as const;

/** MER-20: list and filter reviews, reply once (editable 24 h), report abuse. */
export function MerchantReviews({ merchantId }: { merchantId: string }) {
  const translate = useTranslations("retentionRatings");
  const state = useMerchantReviews(merchantId);
  const { view } = state;
  return (
    <section className="admin-merchant" aria-labelledby="merchant-reviews-title">
      <header className="admin-merchant-heading">
        <h1 id="merchant-reviews-title">{translate("reviewsTitle")}</h1>
      </header>
      <Filter state={state} />
      {view.kind === "loading" && <p role="status">{translate("loading")}</p>}
      {view.kind === "ready" && view.reviews.length === 0 && <p>{translate("noReviews")}</p>}
      {view.kind === "ready" && (
        <ul className="admin-billing-list">
          {view.reviews.map((review) => (
            <ReviewItem key={review.ratingId} review={review} state={state} />
          ))}
        </ul>
      )}
      {view.kind === "ready" && view.nextCursor !== null && (
        <button
          className="admin-merchant-button"
          type="button"
          disabled={state.isPaging}
          onClick={() => {
            void state.loadMore();
          }}
        >
          {translate("loadMore")}
        </button>
      )}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <p role="alert">{translate(failureKeys[view.kind])}</p>
      )}
    </section>
  );
}
